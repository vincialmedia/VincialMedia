# VincialMedia marketing pages

The homepage, the service pages, the pricing page, the region pages, Impressum and Datenschutz (DE and EN) are pre-rendered HTML. This folder holds the generator. The Next.js app serves the output from `public/site/` under clean URLs (see `site-rewrites.mjs` and `next.config.mjs`).

## Change text or prices

- Copy, FAQs, meta titles and descriptions, legal pages: `src/content.js`
- Prices and monthly fees: `src/shared.js` (`PRICE`, `MONTHLY`)
- Layout and markup: `build.mjs`; styles: `src/styles.css`; browser code: `src/app.js`; 3D hero: `src/scene.js`

Then rebuild and commit the output:

```sh
cd site-src
npm ci        # first time only
sh sync.sh    # writes public/site, public/assets, sitemap.xml, robots.txt, llms.txt and site-rewrites.mjs
cd .. && git add -A && git commit -m "Update site"
```

Bump `TODAY` in `build.mjs` when content changes, it feeds `lastmod` in the sitemap.

## Forms

The quote form posts to `src/pages/api/offerte.ts`, which sends through Resend.

| Variable | Required | Default |
|---|---|---|
| `RESEND_API_KEY` | yes | none |
| `RESEND_FROM` | no | `VincialMedia <no-reply@vincialmedia.com>` (domain must be verified in Resend) |
| `LEAD_TO` | no | `vincent@vincialmedia.com` |
| `LEAD_WEBHOOK_URL` | no | none; receives each lead as JSON (Make, Zapier, CRM) |

## Analytics

GA4 `G-K43H5KD1R1` loads only after the visitor accepts in the consent bar. Events: `form_start`, `generate_lead` (value in CHF).

## Local test

```sh
npx next build && RESEND_API_KEY=test NODE_OPTIONS="--require ./site-src/tests/mockfetch.cjs" npx next start -p 3100
python3 site-src/tests/e2e.py   # needs playwright; mails land in /tmp/mails.jsonl
```

Browsers without a GPU (and data-saver mode) get the static hero. Add `?gl=1` to force the 3D scene.
