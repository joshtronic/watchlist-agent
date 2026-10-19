# Punchlist

Work items for v1, in order. See [`spec.md`](./spec.md) for the details behind each item. Feature
phases are deliberately coarse and get broken down when we reach them.

## Phase A — Manual setup (Josh)

Everything that needs a human, done up front so it never blocks later work. Never paste keys or
tokens into the Claude session — set them in your own terminal or the dashboards.

- [x] **Wrangler login:** run `! npx wrangler login` in the Claude session and complete the
      browser OAuth. This also confirms which Cloudflare account wrangler sees.
- [x] **Cloudflare account ID:** note it from the dashboard. It isn't secret, and it goes into
      the GitHub secrets below and optionally into `wrangler.jsonc`.
- [x] **Cloudflare API token for CI:**
  - Dashboard → My Profile → API Tokens → "Edit Cloudflare Workers" template.
  - Scope it to your account and the `fetchlogic.com` zone. Workers AI needs no extra scope
    for deploys.
- [x] **GitHub repo secrets** (`joshtronic/watchlist-agent` → Settings → Secrets → Actions):
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- [x] **Turnstile widget:**
  - Dashboard → Turnstile → Add widget, mode **Managed**.
  - Hostnames: `watchlist.fetchlogic.com` and `localhost`.
  - Site key (public, goes in `wrangler.jsonc`): `0x4AAAAAAFb-6m0dtfu1GnRs`. The secret
    key is kept out of the repo and chat.
- [x] **Local secrets:** copy `.dev.vars.example` to `.dev.vars` and fill in `ALPACA_API_KEY`,
      `ALPACA_SECRET_KEY` and `TURNSTILE_SECRET_KEY`.
- [ ] **Production secrets:** after the first deploy creates the Worker, run
      `npx wrangler secret put` for each of the three secrets above.

## Phase B — Shell (commits to `main`)

- [x] **Scaffold the project**, with Node 26 via `.nvmrc`. Set up:
  - `package.json` (ESM, `engines.node >= 26`);
  - strict TypeScript;
  - Biome;
  - Vite + `@cloudflare/vite-plugin`;
  - dev dependencies: `wrangler`, `vitest`, `@cloudflare/vitest-plugin`.
- [x] **Confirm the toolchain runs on Node 26:** clean install, test runner, build, and
      `wrangler dev`.
- [x] **npm scripts:** `dev`, `build`, `test`, `test:live` (empty suite for now), `lint`,
      `format`, `typecheck`, `deploy`.
- [ ] **`wrangler.jsonc`:**
  - static assets, `AI` binding, `SESSION` DO binding with the `new_sqlite_classes` migration;
  - custom domain route `watchlist.fetchlogic.com`, `workers_dev: false`;
  - `TURNSTILE_SITE_KEY` var.
- [x] `.dev.vars.example`, and `.dev.vars` ignored.
- [x] **Replace the Go-template `.gitignore`** with Node/Wrangler entries: `node_modules/`,
      `.wrangler/`, `dist/`, keeping the `.dev.vars` rules.
- [x] **Test first:** `GET /api/health` → `{ ok: true, commit: "<sha>" }`.
  - The commit comes from a `GIT_COMMIT` var injected at deploy time
    (`wrangler deploy --var GIT_COMMIT:<sha>`).
  - Locally, `npm run deploy` injects `git rev-parse HEAD`; in CI it's `github.sha`.
  - When the var is missing, it reports `"unknown"`, never an empty string.
- [x] **Test first:** stub `SessionDO` ping, proving the DO binding and SQLite storage work in
      the test runtime.
- [x] **Placeholder frontend:** `index.html` + a small TS entry, proving the Vite build and asset
      serving.
- [x] ~~**First manual deploy**~~ — dropped; the first deploy goes through CI (Phase C).
      Josh sets the production secrets (Phase A) once it lands.

## Phase C — GitHub Actions

- [x] **CI workflow on pull requests and pushes to `main`:**
  - `npm ci`, types check, `lint` (Biome), `typecheck`, `test`, `build`.
  - Node version read from `.nvmrc`; npm cache enabled.
- [x] **Deploy workflow on push to `main`, after CI passes:**
  - `npm run deploy` (build, then `wrangler deploy --var GIT_COMMIT:<HEAD sha>`).
  - Uses the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
- [x] **Post-deploy smoke check:** a deploy step polls `/api/health` until `commit` matches
      `github.sha`, and fails the job if it never does.
- [ ] **Verify end to end:** push to `main` and watch CI, the deploy and the smoke check go
      green.
- [ ] **Switch to branches + PRs from here on.** Optionally (Josh), protect `main` with required
      CI checks.

## Phase 1 — Session

- [ ] Landing gate: disclaimer + "I understand" + Turnstile, and `POST /api/session` with
      siteverify.
- [ ] Session cookie (1-year sliding expiry) → DO session record (`disclaimerAcceptedAt`).
- [ ] `GET /api/session`, and `401 no_session` handling for missing or unknown cookies.
- [ ] Logout: in-page confirmation, then `DELETE /api/session` (`deleteAll`, expire the cookie)
      and clear localStorage on the client.
- [ ] Inactivity alarm (wipe after 365 days).

## Phase 2 — Watchlist core

- [ ] Watchlist storage, normalisation and the cap of 10.
- [ ] Starter list module + `POST /api/watchlist/starter` (`409` if not empty).
- [ ] Onboarding UI (starter button) + the read-only watchlist strip.

## Phase 3 — Alpaca client

- [ ] Asset validation (`/v2/assets/{symbol}`: active, tradable, `us_equity`).
- [ ] Batched snapshots (`feed=iex`) → `SnapshotRow` mapping, with change and % computed
      server-side.
- [ ] Error mapping (`market_data_error`, `market_data_rate_limited`).

## Phase 4 — Agent loop (fake AI binding)

- [ ] Tool schemas + argument validation (errors go back to the model).
- [ ] Tools: `list_watchlist`, `add_symbols`, `remove_symbols`, `get_snapshots` (including
      off-list symbols), `respond`.
- [ ] Loop: 5-iteration cap, plain-text fallback, and the digit check → reprompt.
- [ ] Pending add offer (set from `respond.symbols`, valid for the next turn only).
- [ ] History: last 10 exchanges, prose only.
- [ ] AI error mapping (`ai_quota_exhausted`, `ai_error`, `loop_limit`).

## Phase 5 — Chat

- [ ] `POST /api/chat` SSE: `tool_call`, `snapshots`, `watchlist`, `message`, `error`, `done`.
- [ ] Client SSE parser + chat UI + snapshot tables (rendered from data, text-only insertion).
- [ ] localStorage history (200 messages) + the "assistant's memory ends here" divider.

## Phase 6 — Limits and errors

- [ ] Per-session rate limit: 10/min shared by chat and transcribe → `429` + `retryAfter`.
- [ ] Error code → UI state mapping for every code in spec §11.

## Phase 7 — Voice

- [ ] WAV encoder (decode → mono → 16 kHz → 16-bit PCM).
- [ ] `POST /api/transcribe` → Whisper with the ticker `initial_prompt`.
- [ ] Mic UI: 30 s cap, permission-denied handling, transcript fills the input (no auto-send).

## Phase 8 — Live suite (`npm run test:live`)

- [ ] Alpaca contract checks + every starter symbol active and tradable.
- [ ] Whisper fixtures (including a real Firefox ogg recording) → expected tickers.
- [ ] Llama tool-selection cases, digit-check rates, and the pending-offer cases.

## Phase 9 — Polish

- [ ] UI design pass.
- [ ] README: setup, scripts and deploy.
