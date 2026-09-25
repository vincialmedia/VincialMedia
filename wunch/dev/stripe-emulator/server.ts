/**
 * Stripe emulator for local development and end-to-end tests.
 *
 * It implements the small part of the Stripe API that wunch uses
 * (PaymentIntents with manual capture, cancel, refunds, charges, balance
 * transactions) with in-memory state, and delivers signed webhooks exactly
 * like Stripe does. The app talks to it through the real Stripe SDK when
 * STRIPE_API_BASE_URL is set, so the app code path is the production one.
 *
 * It is NOT Stripe: always run a final test in Stripe test mode (see README).
 *
 * Control endpoints (not part of Stripe):
 *   POST /_emulator/confirm   { client_secret, outcome: "success" | "decline" }
 *   POST /_emulator/expire    { payment_intent }   hold expired: cancel like Stripe does after 7 days
 *   POST /_emulator/age-hold  { payment_intent, capture_before }   move capture_before (unix seconds)
 *   GET  /_emulator/state
 *   POST /_emulator/reset
 */
import { createHmac, randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";

const PORT = Number(process.env.STRIPE_EMULATOR_PORT ?? 12111);
const WEBHOOK_URL = process.env.STRIPE_EMULATOR_WEBHOOK_URL ?? "http://localhost:3000/api/stripe/webhook";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_emulator_local_secret";
const API_VERSION = "2026-08-26.dahlia";
const HOLD_DAYS = 7;

type Obj = Record<string, unknown>;
type PaymentIntent = Obj & {
  id: string;
  amount: number;
  amount_capturable: number;
  amount_received: number;
  status: string;
  client_secret: string;
  latest_charge: string | null;
  metadata: Record<string, string>;
};
type Charge = Obj & {
  id: string;
  amount: number;
  amount_captured: number;
  amount_refunded: number;
  captured: boolean;
  refunded: boolean;
  payment_intent: string;
  balance_transaction: string | null;
  payment_method_details: { type: "card"; card: { brand: string; last4: string; capture_before: number } };
};

const state = {
  paymentIntents: new Map<string, PaymentIntent>(),
  charges: new Map<string, Charge>(),
  balanceTransactions: new Map<string, Obj>(),
  refunds: new Map<string, Obj>(),
  idempotency: new Map<string, { status: number; body: unknown }>(),
  events: [] as Obj[],
};

const now = () => Math.floor(Date.now() / 1000);
const id = (prefix: string) => `${prefix}_emu_${randomBytes(12).toString("hex")}`;

// --- form decoding (Stripe SDK sends application/x-www-form-urlencoded with bracket keys)
function decodeForm(body: string): Obj {
  const out: Obj = {};
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const path = rawKey.replace(/\]/g, "").split("[");
    let node: Obj = out;
    path.forEach((key, i) => {
      const last = i === path.length - 1;
      const nextIsIndex = !last && /^\d*$/.test(path[i + 1]);
      if (last) {
        if (Array.isArray(node)) (node as unknown[]).push(value);
        else node[key] = value;
      } else {
        if (node[key] === undefined) node[key] = nextIsIndex ? [] : {};
        node = node[key] as Obj;
      }
    });
  }
  return out;
}

function expandList(params: Obj): string[] {
  const e = params.expand;
  if (Array.isArray(e)) return e as string[];
  if (e && typeof e === "object") return Object.values(e as Obj) as string[];
  return [];
}

// --- serialisation with expand support
function chargeView(ch: Charge, expand: string[]): Obj {
  const view: Obj = { ...ch };
  if (expand.includes("balance_transaction") && ch.balance_transaction) {
    view.balance_transaction = state.balanceTransactions.get(ch.balance_transaction) ?? null;
  }
  return view;
}

function piView(pi: PaymentIntent, expand: string[]): Obj {
  const view: Obj = { ...pi };
  if (pi.latest_charge && expand.some((e) => e === "latest_charge" || e.startsWith("latest_charge."))) {
    const ch = state.charges.get(pi.latest_charge)!;
    view.latest_charge = chargeView(
      ch,
      expand.filter((e) => e.startsWith("latest_charge.")).map((e) => e.slice("latest_charge.".length)),
    );
  }
  return view;
}

// --- webhooks
function sign(payload: string): string {
  const t = now();
  const v1 = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

function emit(type: string, object: Obj) {
  const event = {
    id: id("evt"),
    object: "event",
    api_version: API_VERSION,
    created: now(),
    data: { object: structuredClone(object) },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  };
  state.events.push(event);
  const payload = JSON.stringify(event);
  // deliver after the API response, like Stripe; retry a few times on failure
  const deliver = async (attempt: number) => {
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": sign(payload) },
        body: payload,
      });
      if (!res.ok && attempt < 3) setTimeout(() => deliver(attempt + 1), 500 * attempt);
      log(`webhook ${type} -> ${res.status}`);
    } catch (e) {
      if (attempt < 3) setTimeout(() => deliver(attempt + 1), 500 * attempt);
      else log(`webhook ${type} failed: ${(e as Error).message}`);
    }
  };
  setTimeout(() => deliver(1), 30);
}

function log(msg: string) {
  if (process.env.STRIPE_EMULATOR_QUIET !== "1") console.log(`[stripe-emulator] ${msg}`);
}

// --- API errors
class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public type = "invalid_request_error",
  ) {
    super(message);
  }
}

function requirePi(piId: string): PaymentIntent {
  const pi = state.paymentIntents.get(piId);
  if (!pi) throw new ApiError(404, "resource_missing", `No such payment_intent: '${piId}'`);
  return pi;
}

// --- Stripe API handlers
function createPaymentIntent(p: Obj): Obj {
  const amount = Number(p.amount);
  if (!Number.isInteger(amount) || amount < 50) throw new ApiError(400, "amount_too_small", "Amount must be at least 50 cents");
  if (p.currency !== "chf") throw new ApiError(400, "parameter_invalid", "wunch emulator only supports chf");
  const piId = id("pi");
  const pi: PaymentIntent = {
    id: piId,
    object: "payment_intent",
    amount,
    amount_capturable: 0,
    amount_received: 0,
    capture_method: String(p.capture_method ?? "automatic"),
    currency: "chf",
    status: "requires_payment_method",
    client_secret: `${piId}_secret_${randomBytes(8).toString("hex")}`,
    latest_charge: null,
    metadata: (p.metadata as Record<string, string>) ?? {},
    payment_method_types: (p.payment_method_types as string[]) ?? ["card"],
    description: (p.description as string) ?? null,
    created: now(),
    canceled_at: null,
    cancellation_reason: null,
    last_payment_error: null,
    livemode: false,
  };
  state.paymentIntents.set(piId, pi);
  log(`created ${piId} amount=${amount}`);
  return piView(pi, expandList(p));
}

function capture(pi: PaymentIntent, p: Obj): Obj {
  if (pi.status !== "requires_capture") {
    throw new ApiError(400, "payment_intent_unexpected_state", `This PaymentIntent could not be captured because it has a status of ${pi.status}.`);
  }
  const ch = state.charges.get(pi.latest_charge!)!;
  if (ch.payment_method_details.card.capture_before < now()) {
    throw new ApiError(400, "charge_expired_for_capture", "The charge has expired for capture.");
  }
  const amount = p.amount_to_capture ? Number(p.amount_to_capture) : pi.amount;
  const fee = Math.round(amount * 0.029) + 30; // CH standard pricing: 2.9 % + CHF 0.30
  const txnId = id("txn");
  state.balanceTransactions.set(txnId, {
    id: txnId,
    object: "balance_transaction",
    amount,
    currency: "chf",
    fee,
    net: amount - fee,
    fee_details: [{ amount: fee, currency: "chf", description: "Stripe processing fees", type: "stripe_fee" }],
    status: "pending",
    type: "charge",
    source: ch.id,
    created: now(),
  });
  Object.assign(ch, { captured: true, amount_captured: amount, balance_transaction: txnId });
  Object.assign(pi, { status: "succeeded", amount_received: amount, amount_capturable: 0 });
  emit("payment_intent.succeeded", pi);
  emit("charge.captured", ch);
  log(`captured ${pi.id}`);
  return piView(pi, expandList(p));
}

function cancel(pi: PaymentIntent, p: Obj, reason?: string): Obj {
  if (!["requires_payment_method", "requires_capture", "requires_confirmation", "requires_action"].includes(pi.status)) {
    throw new ApiError(400, "payment_intent_unexpected_state", `You cannot cancel this PaymentIntent because it has a status of ${pi.status}.`);
  }
  Object.assign(pi, {
    status: "canceled",
    amount_capturable: 0,
    canceled_at: now(),
    cancellation_reason: reason ?? (p.cancellation_reason as string) ?? null,
  });
  emit("payment_intent.canceled", pi);
  log(`canceled ${pi.id}`);
  return piView(pi, expandList(p));
}

function createRefund(p: Obj): Obj {
  const pi = requirePi(String(p.payment_intent));
  const ch = pi.latest_charge ? state.charges.get(pi.latest_charge) : undefined;
  if (!ch || !ch.captured) throw new ApiError(400, "charge_not_captured", "This charge has not been captured.");
  const remaining = ch.amount_captured - ch.amount_refunded;
  const amount = p.amount ? Number(p.amount) : remaining;
  if (amount <= 0 || amount > remaining) {
    throw new ApiError(400, "amount_too_large", `Refund amount (${amount}) is greater than unrefunded amount on charge (${remaining})`);
  }
  const refund = {
    id: id("re"),
    object: "refund",
    amount,
    charge: ch.id,
    payment_intent: pi.id,
    currency: "chf",
    reason: (p.reason as string) ?? null,
    status: "succeeded",
    created: now(),
  };
  state.refunds.set(refund.id, refund);
  ch.amount_refunded += amount;
  ch.refunded = ch.amount_refunded >= ch.amount_captured;
  emit("charge.refunded", ch);
  log(`refunded ${amount} on ${pi.id}`);
  return refund;
}

// --- control endpoints
function confirm(p: Obj): Obj {
  const secret = String(p.client_secret ?? "");
  const pi = [...state.paymentIntents.values()].find((x) => x.client_secret === secret);
  if (!pi) throw new ApiError(404, "resource_missing", "Unknown client_secret");
  if (pi.status !== "requires_payment_method") {
    throw new ApiError(400, "payment_intent_unexpected_state", `PaymentIntent has status ${pi.status}`);
  }
  if (p.outcome === "decline") {
    pi.last_payment_error = { code: "card_declined", decline_code: "generic_decline", message: "Your card was declined.", type: "card_error" };
    emit("payment_intent.payment_failed", pi);
    return { ok: false, payment_intent: pi.id, status: pi.status };
  }
  const chId = id("ch");
  const charge: Charge = {
    id: chId,
    object: "charge",
    amount: pi.amount,
    amount_captured: 0,
    amount_refunded: 0,
    captured: false,
    refunded: false,
    currency: "chf",
    paid: true,
    status: "succeeded",
    payment_intent: pi.id,
    balance_transaction: null,
    payment_method_details: {
      type: "card",
      card: { brand: "visa", last4: "4242", capture_before: now() + HOLD_DAYS * 86_400 },
    },
    created: now(),
  };
  state.charges.set(chId, charge);
  Object.assign(pi, { status: "requires_capture", amount_capturable: pi.amount, latest_charge: chId, last_payment_error: null });
  emit("payment_intent.amount_capturable_updated", pi);
  return { ok: true, payment_intent: pi.id, status: pi.status };
}

// --- routing
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "request-id": id("req"), "stripe-version": API_VERSION });
  res.end(JSON.stringify(body));
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method ?? "GET";
  const raw = await readBody(req);
  const isJson = (req.headers["content-type"] ?? "").includes("application/json");
  const params: Obj = method === "GET" ? decodeForm(url.search.slice(1)) : isJson ? (raw ? JSON.parse(raw) : {}) : decodeForm(raw);
  const idemKey = req.headers["idempotency-key"] as string | undefined;
  const cacheKey = idemKey ? `${method} ${url.pathname} ${idemKey}` : null;
  if (cacheKey && state.idempotency.has(cacheKey)) {
    const cached = state.idempotency.get(cacheKey)!;
    return send(res, cached.status, cached.body);
  }

  const parts = url.pathname.split("/").filter(Boolean);
  let result: unknown;
  let status = 200;
  try {
    if (parts[0] === "_emulator") {
      if (parts[1] === "confirm" && method === "POST") result = confirm(params);
      else if (parts[1] === "expire" && method === "POST") {
        const pi = requirePi(String(params.payment_intent));
        result = cancel(pi, {}, "automatic");
      } else if (parts[1] === "age-hold" && method === "POST") {
        const pi = requirePi(String(params.payment_intent));
        const ch = state.charges.get(pi.latest_charge ?? "");
        if (!ch) throw new ApiError(400, "no_charge", "PaymentIntent has no charge yet");
        ch.payment_method_details.card.capture_before = Number(params.capture_before);
        result = { ok: true };
      } else if (parts[1] === "state") {
        result = {
          payment_intents: [...state.paymentIntents.values()],
          charges: [...state.charges.values()],
          refunds: [...state.refunds.values()],
          events: state.events.map((e) => ({ id: e.id, type: e.type })),
        };
      } else if (parts[1] === "reset" && method === "POST") {
        for (const m of [state.paymentIntents, state.charges, state.balanceTransactions, state.refunds, state.idempotency]) m.clear();
        state.events.length = 0;
        result = { ok: true };
      } else throw new ApiError(404, "not_found", "Unknown emulator endpoint");
    } else if (parts[0] === "v1") {
      const [, resource, rid, action] = parts;
      if (resource === "payment_intents" && !rid && method === "POST") result = createPaymentIntent(params);
      else if (resource === "payment_intents" && rid && !action && method === "GET") result = piView(requirePi(rid), expandList(params));
      else if (resource === "payment_intents" && rid && action === "capture") result = capture(requirePi(rid), params);
      else if (resource === "payment_intents" && rid && action === "cancel") result = cancel(requirePi(rid), params);
      else if (resource === "refunds" && method === "POST") result = createRefund(params);
      else if (resource === "charges" && rid && method === "GET") {
        const ch = state.charges.get(rid);
        if (!ch) throw new ApiError(404, "resource_missing", `No such charge: '${rid}'`);
        result = chargeView(ch, expandList(params));
      } else if (resource === "balance_transactions" && rid) {
        const bt = state.balanceTransactions.get(rid);
        if (!bt) throw new ApiError(404, "resource_missing", `No such balance transaction: '${rid}'`);
        result = bt;
      } else throw new ApiError(404, "resource_missing", `Unrecognized request URL (${method}: ${url.pathname}). The wunch emulator only implements what wunch uses.`);
    } else throw new ApiError(404, "not_found", "Not found");
  } catch (e) {
    if (e instanceof ApiError) {
      status = e.status;
      result = { error: { type: e.type, code: e.code, message: e.message } };
    } else {
      status = 500;
      result = { error: { type: "api_error", message: (e as Error).message } };
    }
  }
  if (cacheKey && parts[0] === "v1") state.idempotency.set(cacheKey, { status, body: result });
  send(res, status, result);
}

createServer((req, res) => {
  handle(req, res).catch((e) => send(res, 500, { error: { type: "api_error", message: String(e) } }));
}).listen(PORT, () => log(`listening on http://localhost:${PORT}, webhooks -> ${WEBHOOK_URL}`));
