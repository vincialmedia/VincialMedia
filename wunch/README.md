# wunch — work + lunch

Lunch ordering for offices in Schlieren. Customers pick a delivery day, order from a short rotating menu and pay by card. The card is only **reserved** at checkout; it is **charged when you accept** the order in the admin, and the hold is **released** if you reject it or nobody decides in time.

- Customer shop (German by default, English at `/en`), accounts, one-page checkout
- Stripe Payment Element with manual capture (cards, Apple Pay, Google Pay)
- Admin at `/admin`: live Today view with sound, orders, refunds, payments report, meals, menu planner, coupons, customers, settings
- Emails via Resend (German and English, HTML + text)
- Supabase Postgres with Row Level Security on every table; portions are reserved inside a database transaction

**Stack:** Next.js 16 (App Router, TypeScript) · Supabase (Postgres, Auth, Storage, Realtime, Cron) · Stripe · Resend · Tailwind 4 with shadcn-style components · next-intl · zod · Vitest · Playwright

---

## Contents

1. [Run it locally](#1-run-it-locally)
2. [Environment variables](#2-environment-variables)
3. [Database: migrations, seed, types](#3-database-migrations-seed-types)
4. [Payments and Stripe](#4-payments-and-stripe)
5. [Scheduled job](#5-scheduled-job)
6. [Emails](#6-emails)
7. [Tests](#7-tests)
8. [Deploy to Vercel](#8-deploy-to-vercel)
9. [Go-live checklist](#9-go-live-checklist)
10. [How it works (and decisions)](#10-how-it-works-and-decisions)
11. [Project structure](#11-project-structure)

---

## 1. Run it locally

You need **Node 22** and **Docker** (for the local Supabase stack).

```bash
npm install
npx supabase start          # Postgres, Auth, Storage, Realtime, Mailpit in Docker
cp .env.example .env.local  # then fill it in, see below
npm run db:reset            # migrations + seed data + placeholder meal photos
npm run stripe:emulator     # terminal 2: local Stripe emulator (no Stripe account needed)
npm run dev                 # terminal 3: http://localhost:3000
```

Fill `.env.local` with the values from `npx supabase status -o env`:

| `.env.local` | from `supabase status` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` (`http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `PUBLISHABLE_KEY` |
| `SUPABASE_SECRET_KEY` | `SECRET_KEY` |
| `MAILPIT_URL` | `MAILPIT_URL` (`http://127.0.0.1:54324`) |

For the Stripe emulator use these values (no real keys needed):

```bash
STRIPE_SECRET_KEY=sk_test_emulator
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_emulator
STRIPE_WEBHOOK_SECRET=whsec_emulator_local_secret
STRIPE_API_BASE_URL=http://localhost:12111
```

Also set `ADMIN_EMAILS=you@example.com` and a random `CRON_SECRET` (`openssl rand -hex 24`).

**Admin login:** sign up at `/login` with an email from `ADMIN_EMAILS`, then open `/admin`. Local sign-up needs no email confirmation.

**Emails:** open Mailpit at <http://127.0.0.1:54324>. Every order email and every login link lands there.

**Test payments without Stripe:** with the emulator, the checkout shows two test buttons, one for a card that works and one for a declined card. The emulator sends the same signed webhooks Stripe would.

---

## 2. Environment variables

Every variable is listed with a one-line comment in [`.env.example`](.env.example). Secrets only ever go in `.env.local` (git-ignored) or in Vercel.

| Variable | Where it's used |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Links in emails, Stripe return URL (`https://wunch.ch` in production) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server Supabase clients |
| `SUPABASE_SECRET_KEY` | Server only: webhooks, cron, order creation, admin actions (bypasses RLS) |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe API and Payment Element |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhook signatures |
| `STRIPE_API_BASE_URL` | **Local testing only**: points the Stripe SDK at the emulator. The app refuses to start with it on Vercel production. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Sending emails |
| `MAILPIT_URL` | Local only: catches emails when there's no Resend key |
| `ADMIN_EMAILS` | Comma-separated emails that get the admin role |
| `CRON_SECRET` | Protects `/api/cron/tick` |

---

## 3. Database: migrations, seed, types

Migrations are in `supabase/migrations/`:

| File | What it does |
|---|---|
| `…0100_schema.sql` | Tables, enum of order statuses, default settings and the 3 delivery slots |
| `…0200_functions.sql` | `create_order` (reserves portions, slot capacity and coupon use in one transaction), `transition_order` (status change + history + release), `apply_refund_total`, `claim_order_action`, rate limiter |
| `…0300_rls.sql` | Row Level Security on every table plus explicit table grants |
| `…0400_storage_realtime_cron.sql` | `meal-images` bucket, Realtime for `orders`, pg_cron job |

- **Seed** (`supabase/seed.sql`, local only): 6 meals (5 rotating mains plus Schoggimousse as an always-available dessert), a week of menu days, and coupons `WILLKOMMEN10` (10 %) and `LUNCH5` (CHF 5 off). `npm run db:seed-images` uploads illustrated placeholder photos. Replace them with real photos in Admin → Meals.
- **Reset everything:** `npm run db:reset`.
- **New migration:** `npx supabase migration new <name>`, write SQL, then `npx supabase db reset` to test it and `npm run db:types` to regenerate `src/lib/supabase/database.types.ts`.

All money is stored as integer **Rappen** (`1450` = CHF 14.50). All dates and times are **Europe/Zurich**.

---

## 4. Payments and Stripe

### The flow

```
checkout ──► create_order()  status pending_payment, portions reserved
         ──► PaymentIntent (capture_method=manual, metadata: order id + amounts)
browser  ──► stripe.confirmPayment()     card authorised, amount held
Stripe   ──► payment_intent.amount_capturable_updated
             status new, "received, not charged" email + admin email
admin    ──► Accept  = capture            status accepted, receipt email
         ──► Reject  = cancel             status rejected, hold released, email
         ──► Delivered                    status delivered
         ──► Refund (full or partial)     refunded / partially_refunded, email
cron     ──► auto-cancel at slot start or 12 h before capture_before
```

- Prices, discounts, tips and totals are **always calculated on the server** (`src/lib/pricing.ts`). The database re-checks prices and the subtotal under lock.
- Checkout uses Stripe's "collect payment details before creating an Intent" flow, because the tip and coupon change the amount.
- Webhooks (`/api/stripe/webhook`) verify the signature and store event ids in `stripe_events`, so duplicates are skipped. Handled events:
  - `payment_intent.amount_capturable_updated`
  - `payment_intent.payment_failed`
  - `payment_intent.canceled`
  - `payment_intent.succeeded`
  - `charge.refunded`
- Every status change is conditional, so a repeated webhook, the cron job and an admin click can never double-charge or double-email. A short action lock keeps an admin click and the cron job from calling Stripe for the same order at the same time.
- The confirmation page asks Stripe directly if the webhook hasn't arrived yet, so customers never stare at a stale page.

### Testing with real Stripe (test mode)

The emulator is not Stripe. Before going live, run through the real flow once in Stripe test mode:

1. Get test keys from the Stripe Dashboard (or a Stripe **sandbox**) and put them in `.env.local`. Remove `STRIPE_API_BASE_URL`.
2. Forward webhooks with the [Stripe CLI](https://docs.stripe.com/stripe-cli):
   ```bash
   stripe login
   npm run stripe:listen   # = stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
3. Pay with test cards:

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | Works |
| `4000 0025 0000 3155` | Asks for 3-D Secure, then works |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 9995` | Declined, insufficient funds |

Any future expiry date, any CVC, any postcode.

4. Accept one order (capture), reject one (hold released), refund one partially. Check each in the Stripe Dashboard.

---

## 5. Scheduled job

Every 5 minutes, Supabase Cron (`pg_cron` + `pg_net`) calls `POST /api/cron/tick` with `Authorization: Bearer $CRON_SECRET`. This doesn't depend on the Vercel plan. The job:

- cancels orders still `new` when their slot starts, or 12 hours before Stripe's `capture_before`, whichever comes first, and emails the customer that they weren't charged
- releases portions held by checkouts stuck in `pending_payment` for more than 30 minutes (after one last check with Stripe)
- emails you a reminder for orders waiting longer than the reminder setting (10 minutes by default)
- fills in Stripe fees that weren't available right after capture
- keeps admin roles in line with `ADMIN_EMAILS`

The migration already schedules the job. It reads the URL and secret from Supabase **Vault**. Set them once per environment in the SQL editor:

```sql
select vault.create_secret('https://wunch.ch/api/cron/tick', 'wunch_cron_url');
select vault.create_secret('<same value as CRON_SECRET>', 'wunch_cron_secret');
-- check it runs:
select * from cron.job_run_details order by start_time desc limit 5;
select * from net._http_response order by created desc limit 5;
```

To change a value, use `select vault.update_secret((select id from vault.secrets where name = 'wunch_cron_secret'), '<new>');`.

Locally, run it by hand with `npm run cron:tick`.

---

## 6. Emails

- Order emails are written in `src/lib/email/templates.ts`, in German (Swiss spelling, "Du") and English, with HTML and plain text. Each email goes out in the customer's language.
  - To customers: order received (card reserved, not charged), accepted (receipt with company and address, for expenses), rejected (with reason), auto-cancelled, refund issued.
  - To you: new order with a one-tap link to it in admin, and reminders for undecided orders.
- Every email is logged in `email_log` with a dedupe key, so webhook retries never send twice. You can see it on the admin order page.
- Without `RESEND_API_KEY`, emails go to Mailpit (local) or only to the log.
- Supabase Auth emails (magic link, confirm, password reset, email change) use the bilingual templates in `supabase/templates/`. They pick the language from the user's metadata.

---

## 7. Tests

```bash
npm run lint        # ESLint (0 errors, 0 warnings)
npm run typecheck   # TypeScript (0 errors)
npm test            # unit tests: pricing, coupons, cutoff/slot rules, money, formats, reports, emails, messages
npm run test:db     # Postgres tests against the local stack: portion reservation race, release, slot capacity, coupon limits, RLS
npm run test:e2e    # Playwright (starts the emulator and the dev server)
```

Playwright covers:

- order then accept captures the payment
- order then reject cancels the hold
- auto-cancel: 12 hours before the capture deadline, at slot start, and expired checkouts
- a sold-out meal can't be ordered
- a postcode outside the area is blocked
- axe-core accessibility checks on the customer and admin pages

It needs a Chromium: `npx playwright install chromium`.

`.github/workflows/ci.yml` runs all of the above on GitHub once wunch has its own repository.

---

## 8. Deploy to Vercel

1. **Supabase project.** Create a project in region **Zurich (eu-central-2)**. Then:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push          # applies the migrations (not the demo seed)
   ```
   In the dashboard: Database → Extensions should show `pg_cron` and `pg_net` enabled. The migration enables them.
2. **Vercel project.** Import the repository and set the Root Directory to `wunch` if it still lives in a subfolder. Add every variable from `.env.example` for Production, and leave `STRIPE_API_BASE_URL` empty. Deploy.
3. **Stripe webhook.** In the Dashboard, go to Developers → Webhooks → Add endpoint `https://wunch.ch/api/stripe/webhook` and select these events:
   - `payment_intent.amount_capturable_updated`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
   - `payment_intent.succeeded`
   - `charge.refunded`

   Put the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.
4. **Cron.** Set the two Vault secrets (see [section 5](#5-scheduled-job)).
5. **Auth.** Configure it as described in the checklist below.
6. **Menu.** Create your meals, set up the menu planner and check Settings.

---

## 9. Go-live checklist

**Stripe**
- [ ] Live keys (`sk_live_…`, `pk_live_…`) set in Vercel Production
- [ ] Live webhook endpoint `https://wunch.ch/api/stripe/webhook` with the 5 events above, and its `whsec_…` set
- [ ] Domain `wunch.ch` (and `www.wunch.ch` if used) registered under Settings → Payment method domains, so **Apple Pay** shows up
- [ ] Cards, Apple Pay and Google Pay enabled under Payment methods; statement descriptor set (e.g. `WUNCH`)
- [ ] One real order in live mode: accept it, refund it, check that both show in the Dashboard

**Resend and email**
- [ ] Sending domain `wunch.ch` verified in Resend (SPF, DKIM, and ideally DMARC DNS records)
- [ ] `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `wunch <bestellung@wunch.ch>`) and `EMAIL_REPLY_TO` set
- [ ] Resend connected as **custom SMTP for Supabase Auth** (Supabase's built-in sender is only for testing and sends very few emails per hour):
  - Where: Auth → Emails → SMTP settings
  - Host `smtp.resend.com`, port `465`, user `resend`, password = a Resend API key
  - Sender `bestellung@wunch.ch`
- [ ] Auth email rate limit raised (Auth → Rate limits) after the custom SMTP is set up
- [ ] German/English **auth email templates** pasted from `supabase/templates/` into Auth → Emails → Templates (magic link, confirm signup, reset password, change email), with the subjects from `supabase/config.toml`

**Supabase**
- [ ] Auth → URL configuration: Site URL `https://wunch.ch`, Redirect URLs `https://wunch.ch/**` (and your Vercel preview URL pattern if you use previews)
- [ ] Decide on "Confirm email" (Auth → Providers → Email). Off (recommended) lets people sign up and pay in one go. On makes them click a link first.
- [ ] Vault secrets `wunch_cron_url` and `wunch_cron_secret` set; `cron.job_run_details` shows successful runs
- [ ] Paid plan (Pro) for production. Free projects pause after a week of inactivity, and a paused database means the shop is down. Pro also gives daily backups.

**App**
- [ ] `ADMIN_EMAILS` set to your email(s)
- [ ] `NEXT_PUBLIC_SITE_URL=https://wunch.ch`, and `STRIPE_API_BASE_URL` empty
- [ ] `CRON_SECRET` set (and the same value in Vault)
- [ ] Impressum, AGB and Datenschutz written (placeholders in `src/app/[locale]/(shop)/impressum|agb|datenschutz`)
- [ ] Real meal photos uploaded; placeholder meals removed
- [ ] Settings checked: cutoff, delivery days, postcodes, slots, delivery fee, VAT (and VAT number once registered), business name and address for receipts

---

## 10. How it works (and decisions)

**Order statuses:** `pending_payment` → `new` → `accepted` → `delivered`. The other outcomes:

| Status | When |
|---|---|
| `rejected` | You rejected it |
| `auto_cancelled` | Nobody decided in time |
| `payment_failed` | The card was declined |
| `expired` | Checkout abandoned or replaced; added to the brief's list so "payment failed" keeps meaning a declined card |
| `refunded`, `partially_refunded` | Money given back after capture |

Portions and coupon uses are released for rejected, auto-cancelled, failed and expired orders. They are not released on refunds, because the food was already made.

**Portions** are reserved in `create_order()` with `SELECT … FOR UPDATE` on the menu row, in meal order, inside one transaction. Two people can't buy the last portion (there's a test that races two checkouts). The slot row is locked the same way for the "max orders per slot" setting.

**Coupons** only reduce the meal subtotal, never the tip or the delivery fee, and never go below zero. Percentages round to 5 Rappen. Limits that depend on other orders (total uses, uses per customer, first order only) are checked again under a lock in the database.

**Tips:** none, the percentages from Settings (default 5/10/15 %) or a custom amount capped at CHF 100. Percentages are calculated on the meal subtotal after discount, rounded to 5 Rappen.

**Cutoff and days ahead:**
- Same-day orders close at 10:30.
- Customers can order up to 5 calendar days ahead, on delivery weekdays that aren't closed dates.
- The setting is capped at 6 days because card holds last 7.
- The auto-cancel 12 hours before `capture_before` is the safety net.

**Security:**
- RLS is on every table, with explicit grants: customers only see their own profile and orders, menu data is public, and coupons aren't.
- Customers can't change their role or write orders directly. Orders, payments and emails are written only by the server with the secret key, after checks.
- Admin pages and actions check the role on the server. `ADMIN_EMAILS` is the source of truth, mirrored into `profiles.role` so RLS and Realtime can use it.
- Card data only ever goes through Stripe Elements.

**Rate limits:**
- Login, sign-up and magic links use Supabase Auth's per-IP limits (`[auth.rate_limit]` in `config.toml`, and the dashboard in production).
- Checkout and failed coupon guesses use a Postgres-backed limiter per user and per IP.

**Privacy:** essential cookies only (the Supabase session), no tracking. Stripe.js is loaded only on the payment step.

**Decisions worth checking:**
- **VAT:** calculated as included VAT on meals + delivery fee, not on the tip. Swiss food delivery is usually the reduced rate (2.6 %). Confirm with your accountant before you set a rate.
- **Currency and time zone:** fixed (CHF, Europe/Zurich), not editable in Settings. Changing them would break stored amounts and schedules.
- **Magic links** use `token_hash` links, so they work when the email is opened on another device than the one that asked for it.
- **Stripe emulator:** used by the automated tests because this project was built without Stripe keys. It runs the real Stripe SDK against a local stand-in; the final check must be in Stripe test mode ([section 4](#4-payments-and-stripe)).
- **Out of scope:** TWINT (no manual capture), company invoices, subscriptions.

---

## 11. Project structure

```
src/
  app/[locale]/(shop)/     menu, meal, cart, checkout, orders, account, login, legal pages
  app/[locale]/admin/      today, orders, payments, meals, menu, coupons, customers, settings
  app/api/stripe/webhook   Stripe webhooks
  app/api/cron/tick        scheduled job (pg_cron)
  app/api/admin/payments   CSV export
  app/auth/                email link callback, sign out
  components/              ui/ (shadcn-style), menu, cart, orders, admin, layout
  lib/pricing.ts           price calculation (unit tested)
  lib/coupons.ts           coupon rules (unit tested)
  lib/schedule.ts          cutoff, dates, slots, auto-cancel time (unit tested)
  lib/orders/              quote, lifecycle (state machine + Stripe), cron
  lib/email/               templates, sending, notifications
  lib/actions/             server actions (checkout, admin, account)
  app/theme.css            all brand colours, fonts and radius
messages/de.json, en.json  all texts
supabase/                  migrations, seed, auth email templates, config
dev/stripe-emulator/       local Stripe stand-in for tests
tests/db, tests/e2e        database and Playwright tests
```

**Branding:** colours, radius and font variables live in `src/app/theme.css`, and the two fonts in `src/app/fonts.ts`. The placeholder logo is `src/components/layout/logo.tsx`. It always shows "work + lunch" under the name, so nobody spells it "wunsch".
