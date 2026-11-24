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

`lastmod.json` remembers when each page's content last changed. The build updates it by itself and the sitemap and structured data read their dates from it, so commit it with the rest.

A public phone number goes into `PHONE` at the top of `build.mjs`. It then shows in the footer and in the structured data.

## 3D visuals

The homepage hero and the device on each service page are drawn live by `src/scene.js` (three.js). A service page uses the same pinned stage as the homepage: the intro shows first with the device beside it (wide screens) or below it (narrow ones), then the device moves to the middle and each caption appears, stays and leaves as you scroll. Words on the device screens come from `scene` in `src/content.js`. Visitors without a graphics chip, with data saver or with reduced motion get a still image instead, and everyone sees that still until the 3D model has loaded.

The stills live in `src/vis/` (`-w` for wide screens, `-p` for narrow ones) and are rendered from the same scene, so re-render them after changing `scene.js` or the screen texts:

```sh
npx next build && npx next start -p 3100   # in the repo root, in a second terminal
python3 site-src/tests/posters.py          # all stills, or name some: posters.py web auto
sh site-src/sync.sh
```

The BuyAuto still uses two real screenshots in `vis-src/` (1600x974 for the laptop, 720x1558 for the phone). Replace them and run `posters.py case` when the site changes.

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

Browsers without a GPU, with data saver or with reduced motion get the still versions. Add `?gl=1` to force the 3D scenes.
