import type { NextApiRequest, NextApiResponse } from "next";
import { createHash, randomBytes } from "crypto";

/*
 * Backend for the couples question game served at /secret-game.
 *
 * Two players each hold a private token. Each player's answers are stored
 * server-side and are never sent to the other player: the server compares
 * both sets and returns only the matches.
 *
 * Storage: Upstash Redis through its REST API. The Vercel Marketplace
 * integration sets KV_REST_API_URL / KV_REST_API_TOKEN; the Upstash names
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN work too. Without them,
 * production answers 503 and local development falls back to memory.
 */

type Val = "y" | "m" | "n";
type Answers = Record<string, Val>;
type Seat = 1 | 2;
type Custom = { id: string; n: string; t: "both" | "dir"; h: 1 | 2 | 3 };
type Game = {
  seats: { 1: string; 2: string | null };
  names: { 1: string; 2: string | null };
  invite: string | null;
  custom: Custom[];
  created: number;
};
type Player = { game: string; seat: Seat; answers: Answers; updated: number };

const MAX_GAMES = 300;
const MAX_ANSWERS = 600;
const MAX_CUSTOM = 50;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/* ---------- storage ---------- */

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

const memory = new Map<string, string>();
function memoryCommand(args: string[]): unknown {
  const [name, key, value, flag] = args;
  switch (name.toUpperCase()) {
    case "GET":
      return memory.has(key) ? memory.get(key) : null;
    case "SET":
      if (flag === "NX" && memory.has(key)) return null;
      memory.set(key, value);
      return "OK";
    case "DEL": {
      let n = 0;
      for (const k of args.slice(1)) if (memory.delete(k)) n++;
      return n;
    }
    case "INCR":
    case "DECR": {
      const next = Number(memory.get(key) || 0) + (name.toUpperCase() === "INCR" ? 1 : -1);
      memory.set(key, String(next));
      return next;
    }
    default:
      throw new HttpError(500, "Unsupported command.");
  }
}

async function redis(...args: (string | number)[]): Promise<unknown> {
  const parts = args.map(String);
  const cfg = redisConfig();
  if (!cfg) {
    if (process.env.NODE_ENV === "production") {
      throw new HttpError(503, "Storage is not connected yet.");
    }
    return memoryCommand(parts);
  }
  let response: Response;
  try {
    response = await fetch(cfg.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(parts),
      cache: "no-store",
    });
  } catch {
    throw new HttpError(502, "Storage could not be reached.");
  }
  const body = (await response.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  if (!response.ok || !body || body.error) throw new HttpError(502, "Storage error.");
  return body.result;
}

async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await redis("GET", key);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
const setJSON = (key: string, value: unknown) => redis("SET", key, JSON.stringify(value));

/* ---------- keys and tokens ---------- */

const newToken = (bytes: number) => randomBytes(bytes).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const gameKey = (id: string) => `sg:g:${id}`;
const playerKey = (tokenHash: string) => `sg:p:${tokenHash}`;
const inviteKey = (inviteHash: string) => `sg:i:${inviteHash}`;
const COUNT_KEY = "sg:count";

/* ---------- validation ---------- */

const TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/;
const ANSWER_KEY_RE = /^[A-Za-z0-9_]{1,40}(:give|:get)?$/;
const CUSTOM_ID_RE = /^[A-Za-z0-9]{1,24}$/;

function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return input.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function readToken(input: unknown): string {
  if (typeof input !== "string" || !TOKEN_RE.test(input)) throw new HttpError(401, "Unknown player.");
  return input;
}

function readName(input: unknown): string {
  const name = cleanText(input, 30);
  if (!name) throw new HttpError(400, "Please enter a name.");
  return name;
}

function readAnswers(input: unknown): Answers {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Invalid answers.");
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_ANSWERS) throw new HttpError(400, "Too many answers.");
  const out: Answers = {};
  for (const [key, value] of entries) {
    if (!ANSWER_KEY_RE.test(key)) throw new HttpError(400, "Invalid answer key.");
    if (value !== "y" && value !== "m" && value !== "n") throw new HttpError(400, "Invalid answer value.");
    out[key] = value;
  }
  return out;
}

function readCustom(input: unknown): Custom[] {
  if (!Array.isArray(input) || input.length > MAX_CUSTOM) throw new HttpError(400, "Invalid questions.");
  return input.map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : "";
    const n = cleanText(item.n, 140);
    if (!CUSTOM_ID_RE.test(id) || !n) throw new HttpError(400, "Invalid question.");
    const h = item.h === 1 || item.h === 3 ? item.h : 2;
    return { id, n, t: item.t === "dir" ? "dir" : "both", h } as Custom;
  });
}

/* ---------- matching ---------- */

// "spank:give" from one player pairs with "spank:get" from the other.
function partnerKey(key: string): string {
  if (key.endsWith(":give")) return key.slice(0, -5) + ":get";
  if (key.endsWith(":get")) return key.slice(0, -4) + ":give";
  return key;
}

// Keys are returned from the viewer's side. Level "y": both said yes.
// Level "m": one said yes and the other maybe.
function matches(mine: Answers, theirs: Answers) {
  const out: { k: string; l: "y" | "m" }[] = [];
  for (const [key, value] of Object.entries(mine)) {
    const other = theirs[partnerKey(key)];
    if (value === "y" && other === "y") out.push({ k: key, l: "y" });
    else if ((value === "y" && other === "m") || (value === "m" && other === "y")) out.push({ k: key, l: "m" });
  }
  return out;
}

/* ---------- state ---------- */

async function loadPlayer(token: string) {
  const tokenHash = hash(token);
  const player = await getJSON<Player>(playerKey(tokenHash));
  if (!player) throw new HttpError(401, "This game doesn't exist anymore.");
  const game = await getJSON<Game>(gameKey(player.game));
  if (!game || game.seats[player.seat] !== tokenHash) throw new HttpError(401, "This game doesn't exist anymore.");
  return { tokenHash, player, game };
}

async function buildState(game: Game, me: Player) {
  const otherSeat: Seat = me.seat === 1 ? 2 : 1;
  const partnerHash = game.seats[otherSeat];
  const partner = partnerHash ? await getJSON<Player>(playerKey(partnerHash)) : null;
  return {
    me: { seat: me.seat, name: game.names[me.seat], answers: me.answers },
    partner: partner ? { name: game.names[otherSeat], count: Object.keys(partner.answers).length } : null,
    invite: me.seat === 1 && !game.seats[2] ? game.invite : null,
    custom: game.custom,
    matches: partner ? matches(me.answers, partner.answers) : [],
  };
}

/* ---------- actions ---------- */

async function create(body: Record<string, unknown>) {
  const name = readName(body.name);
  const count = Number(await redis("INCR", COUNT_KEY));
  if (count > MAX_GAMES) {
    await redis("DECR", COUNT_KEY);
    throw new HttpError(429, "No room for new games right now.");
  }
  const gameId = newToken(12);
  const token = newToken(24);
  const invite = newToken(18);
  const game: Game = {
    seats: { 1: hash(token), 2: null },
    names: { 1: name, 2: null },
    invite,
    custom: [],
    created: Date.now(),
  };
  const player: Player = { game: gameId, seat: 1, answers: {}, updated: Date.now() };
  await setJSON(gameKey(gameId), game);
  await setJSON(playerKey(hash(token)), player);
  await redis("SET", inviteKey(hash(invite)), gameId);
  return { token, ...(await buildState(game, player)) };
}

async function peek(body: Record<string, unknown>) {
  const invite = typeof body.invite === "string" && TOKEN_RE.test(body.invite) ? body.invite : null;
  const gameId = invite ? await redis("GET", inviteKey(hash(invite))) : null;
  const game = typeof gameId === "string" ? await getJSON<Game>(gameKey(gameId)) : null;
  if (!game || game.seats[2]) throw new HttpError(404, "This invite link was already used or doesn't exist.");
  return { name: game.names[1] };
}

async function join(body: Record<string, unknown>) {
  const name = readName(body.name);
  const invite = typeof body.invite === "string" && TOKEN_RE.test(body.invite) ? body.invite : null;
  const key = invite ? inviteKey(hash(invite)) : null;
  const gameId = key ? await redis("GET", key) : null;
  const used = new HttpError(404, "This invite link was already used or doesn't exist.");
  if (typeof gameId !== "string") throw used;
  // DEL is atomic: only one caller gets 1, so an invite works exactly once.
  if (Number(await redis("DEL", key)) !== 1) throw used;
  const game = await getJSON<Game>(gameKey(gameId));
  if (!game || game.seats[2]) throw used;
  const token = newToken(24);
  game.seats[2] = hash(token);
  game.names[2] = name;
  game.invite = null;
  const player: Player = { game: gameId, seat: 2, answers: {}, updated: Date.now() };
  await setJSON(playerKey(hash(token)), player);
  await setJSON(gameKey(gameId), game);
  return { token, ...(await buildState(game, player)) };
}

async function state(body: Record<string, unknown>) {
  const { player, game } = await loadPlayer(readToken(body.token));
  return buildState(game, player);
}

async function save(body: Record<string, unknown>) {
  const answers = readAnswers(body.answers);
  const { tokenHash, player, game } = await loadPlayer(readToken(body.token));
  player.answers = answers;
  player.updated = Date.now();
  await setJSON(playerKey(tokenHash), player);
  return buildState(game, player);
}

async function setCustom(body: Record<string, unknown>) {
  const custom = readCustom(body.custom);
  const { player, game } = await loadPlayer(readToken(body.token));
  game.custom = custom;
  await setJSON(gameKey(player.game), game);
  return buildState(game, player);
}

async function remove(body: Record<string, unknown>) {
  const { player, game } = await loadPlayer(readToken(body.token));
  const keys = [gameKey(player.game), playerKey(game.seats[1])];
  if (game.seats[2]) keys.push(playerKey(game.seats[2]));
  if (game.invite) keys.push(inviteKey(hash(game.invite)));
  await redis("DEL", ...keys);
  await redis("DECR", COUNT_KEY);
  return { deleted: true };
}

const ACTIONS: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
  create,
  peek,
  join,
  state,
  save,
  custom: setCustom,
  delete: remove,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const action = typeof body.action === "string" ? ACTIONS[body.action] : undefined;
  if (!action) return res.status(400).json({ error: "Unknown action." });
  try {
    return res.status(200).json(await action(body));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error("secret-game error", err instanceof Error ? err.message : "unknown");
    return res.status(500).json({ error: "Something went wrong." });
  }
}
