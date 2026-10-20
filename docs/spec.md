# Watchlist Agent — Spec (v1 / MVP)

Status: **draft for review**

## 1. Summary

A single-page web app at `watchlist.fetchlogic.com`. A visitor passes a bot check, builds a stock
watchlist (up to 10 symbols), and chats with an LLM about it by text or voice. The LLM manages
the watchlist and fetches market data through a tool-calling loop against Alpaca's free market
data API.

This is an internal proof of concept with 1–2 concurrent users expected. Turnstile is there to
stop drive-by bots, not as a security boundary.

## 2. Scope

### In scope (v1)

- Landing gate: Turnstile, plus a disclaimer (no financial advice, cookie use) that the user
  must acknowledge.
- A session cookie that maps to a per-session Durable Object.
- Watchlist onboarding: a one-click "QQQ top 10" starter list, or adding symbols by chat.
- Chat with an LLM by text or voice (voice is transcribed to text and never auto-sent).
- LLM tools: add symbols, remove symbols, list the watchlist, get snapshots.
- Snapshot data rendered as tables built directly from tool results.
- A read-only watchlist strip that is always visible.
- Chat history: a short server-side window for LLM context, plus a longer client-side display
  history.
- Logout, which deletes all of the user's data.
- Graceful handling of Workers AI quota exhaustion, Alpaca errors and rate limits.
- Per-session rate limit of 10 requests per minute.

### Out of scope (v1)

- Bloomberg-terminal style UI (shelved; to be revisited as its own effort).
- Bars, news and any market data beyond snapshots.
- Spoken replies (TTS).
- Live-updating prices in the strip.
- Accounts, ACLs and admin views.
- Playwright / end-to-end browser tests.
- Crypto and non-US instruments.

## 3. User flow

1. **Landing (no session cookie).** The page shows:
   - the disclaimer: "This is not financial advice. Nothing here is a recommendation to buy,
     sell or hold any security. This site uses a cookie to keep your session.";
   - an "I understand" checkbox;
   - the Turnstile widget.

   Submitting requires both. On success the server creates the session, sets the cookie and
   returns the empty session state.
2. **Onboarding (empty watchlist).** The page shows a "Start with QQQ's top 10 holdings"
   button. It is deterministic and makes no LLM call. Alternatively the user can type or speak
   "add NET, SNOW and AAPL" into the chat.
3. **Main view.**
   - The watchlist strip (symbols only) sits at the top.
   - The chat transcript sits below it, with the input at the bottom: a text field, a mic
     button and a send button.
4. **Chatting.**
   - The user sends a message. Progress events stream in, such as "Fetching snapshots for NET,
     QQQ…".
   - Snapshot tables render from the tool data, followed by the assistant's text.
   - The strip updates whenever a tool changes the watchlist.
5. **Voice.**
   - Click the mic to start recording and click again to stop; recording stops automatically
     at 30 s.
   - The audio is transcribed and the text is placed in the input for the user to edit.
   - The user sends it manually.
6. **Logout.**
   - A logout control opens an in-page confirmation: "This permanently deletes your watchlist
     and chat history."
   - On confirm, the server data is deleted, the cookie is expired, localStorage is cleared
     and the user returns to the landing gate.
7. **Return visit.** Cookie present → the server returns the watchlist, and the transcript is
   restored from localStorage.

## 4. Architecture

```
Browser (vanilla TS, Vite build)
  │  static assets
  ▼
Worker (router)  ── Turnstile siteverify (session creation only)
  │  cookie → DO id (idFromName)
  ▼
SessionDO (SQLite-backed) — one per session
  ├─ state: watchlist, context history, disclaimer ack, rate-limit window, lastActive
  ├─ agent loop ── Workers AI (Llama 3.3 70B) ── tools ── Alpaca (data + assets APIs)
  ├─ transcription ── Workers AI (Whisper large v3 turbo)
  └─ alarm: wipe after 1 year of inactivity
```

- The agent loop runs **inside the DO**. Requests for a session are serialised, so concurrent
  tabs or double-submits can't race on the watchlist.
- The Worker is a thin router. It handles static assets, cookie parsing and creating sessions
  after Turnstile, and forwards everything else to the session's DO.

### 4.1 Durable Object storage

Each session's DO has its own private storage. We use the DO key-value API (stored in SQLite
on this backend) with JSON values. The TypeScript types are the schema; there are no SQL
tables and no data migrations.

| Key            | Value                                                  | Notes                                                     |
|----------------|--------------------------------------------------------|-----------------------------------------------------------|
| `session`      | `{ disclaimerAcceptedAt, lastActive, cookieIssuedAt }` | Epoch ms. Absent = no session.                            |
| `watchlist`    | `string[]`                                             | Uppercase, max 10, in order.                              |
| `history`      | `{ role, text, at }[]`                                 | Last 10 exchanges, prose only. Role is user or assistant. |
| `pendingOffer` | `{ symbols: string[] }`                                | Absent when there's no offer.                             |
| `rateLimit`    | `number[]`                                             | Request times in the last 60 s.                           |

- **Shape changes:** read old values with defaults. If a change can't be read compatibly, a
  session can be wiped. That's acceptable for this POC, and the "start over" path already
  exists.
- **Not to be confused with** the Wrangler `migrations` in `wrangler.jsonc`, which only
  create, rename or delete DO classes.
- **Revisit SQL tables** if history grows into something to search or page through.

## 5. HTTP API

All `/api/*` routes except `POST /api/session` require a valid session cookie. Without one they
return `401 { error: "no_session" }`, and the client shows the landing gate.

| Method | Path                     | Body                                           | Response                                                                |
|--------|--------------------------|------------------------------------------------|-------------------------------------------------------------------------|
| POST   | `/api/session`           | `{ turnstileToken, acceptedDisclaimer: true }` | `200 { watchlist: [] }` + `Set-Cookie`                                  |
| GET    | `/api/session`           | —                                              | `200 { watchlist: string[] }`                                           |
| DELETE | `/api/session`           | —                                              | `204` + expiring `Set-Cookie`                                           |
| POST   | `/api/watchlist/starter` | —                                              | `200 { watchlist: string[] }` (only when the list is empty, else `409`) |
| POST   | `/api/chat`              | `{ message: string }` (max 500 chars)          | `text/event-stream` (see §7)                                            |
| POST   | `/api/transcribe`        | `audio/wav` body (max ~1.5 MB)                 | `200 { text: string }`                                                  |

Rate-limited routes: `/api/chat` and `/api/transcribe` share a bucket of **10 requests per
minute per session**. Over the limit, they return `429 { error: "rate_limited", retryAfter }`.

## 6. Session and cookie

- **Cookie:** `wl_session=<random 128-bit id, base64url>; HttpOnly; Secure; SameSite=Lax;
  Path=/; Max-Age=31536000`.
- **Sliding expiry:** the cookie is re-issued on activity, at most once per day.
- **Session creation:** a session ID is only minted after Turnstile siteverify succeeds and
  `acceptedDisclaimer === true`. The DO records `disclaimerAcceptedAt`.
- **Unknown IDs:** a cookie whose DO has no session record (e.g. after a wipe) is treated as no
  session (`401`).
- **Inactivity wipe:** a DO alarm is pushed out to `lastActive + 365 days` on each request.
  When it fires, it calls `deleteAll()`.
- **Logout:** `deleteAll()` on the DO, then expire the cookie. The client clears localStorage.

## 7. Chat and agent loop

### Request handling (inside the DO)

1. Check the rate limit and validate the message (non-empty, ≤ 500 chars).
2. Build the prompt: system prompt + context history (last 10 exchanges) + the new user message.
3. Loop, **max 5 iterations**:
   - Call Llama with the tool definitions.
   - If it calls `respond` (§8): run the figure check (§7.1). If the check passes, that's the
     final answer.
   - If it calls any other tools:
     - Validate each call's arguments against its schema.
     - Execute it, or turn the validation failure into an error tool result.
     - Emit progress events.
     - Append the results and continue.
   - If it returns plain text instead of calling `respond`: treat the text as `prose` with
     `symbols: []` and run the same figure check. The model is unreliable about always calling
     a final tool, and we shouldn't fail the turn over it.
4. If the cap is hit, emit an error event (`loop_limit`) instead of a half-answer.
5. Persist the exchange (user text + final prose only) and trim to the last 10 exchanges.

### 7.1 Figure check (keeps the prose untainted)

The prompt says: **never state prices or percentages; the tables show them**. Because the model
won't always comply, every final `prose` is checked before it's sent, and the rule is
deliberately blunt:

- **Any digit in the prose → reprompt.** Append a corrective message restating the rule and
  let the model produce a new `respond`. Each reprompt counts toward the 5-iteration cap.
- **No digits:** send the prose.
- **Cap reached:** this is the normal `loop_limit` error. Any `snapshots` events already
  emitted have rendered their tables, so the user still sees the data.

This will occasionally reprompt on harmless numbers ("2 of your stocks"). That's acceptable for
v1, and we'll tune it after hands-on use.

### SSE events

```
event: tool_call     data: { name, args }                  // for progress UI ("Fetching…")
event: snapshots     data: { asOf, rows: SnapshotRow[] }   // render a table, untouched by the LLM
event: watchlist     data: { symbols: string[] }           // update the strip
event: message       data: { symbols, prose }              // final answer from `respond` (post figure check)
event: error         data: { code, message }               // see §11
event: done          data: {}
```

Assistant text is streamed as a single `message` event in v1. Token-level streaming is a later
nicety.

### Models

- **Chat:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
- **Transcription:** `@cf/openai/whisper-large-v3-turbo`.

### System prompt requirements

- Its role is a watchlist assistant. It must **never** give financial advice, recommendations,
  price targets or buy/sell/hold opinions. It politely declines and offers factual data
  instead.
- It must **never state prices or percentages**. The UI shows them as tables, and the model
  may refer to them ("NET is the biggest mover today, see above"). This rule is enforced by
  the figure check in §7.1.
- It must always finish by calling `respond`.
- Market data comes from IEX only. It must mention that when relevant (e.g. volume questions)
  and respect the timestamps (no "up today" claims when the market is closed).
- When a user asks about a symbol that isn't on their watchlist, answer the question, then ask
  whether they'd like to add it.
  - If the watchlist is full, ask whether they'd like to swap a symbol out.
  - The offer is only valid for the **user's very next message**. If that message doesn't
    accept it, the offer is dead and must not be acted on later.

### Boundaries and context

- **The current watchlist is in the system prompt on every turn,** so the model never has to
  guess what's on it and never offers to add a symbol that's already there.
- **The prompt lists what the tools can and cannot answer.** They can't answer fundamentals,
  analyst ratings, predictions, crypto, options, futures, or non-US markets. On a miss the
  assistant says so plainly. If it shows related data instead, it says exactly what that data
  is, e.g. "this is the latest snapshot, not last week's performance".
- **`get_snapshots` includes Alpaca's market clock** (`/v2/clock`). When the market is
  closed, the figures are the last session's, never "today's".
- **Table captions explain the source:** IEX only, and how current the figures are. They point
  the user to their brokerage account for real-time prices.

### Pending add offer

To keep this out of prompt-memory alone:

- When `respond.symbols` includes off-watchlist symbols, the DO stores
  `pendingOffer = { symbols }`.
- On the next turn only, the system prompt includes "Pending offer: add SNOW? Valid for this
  message only."
- `pendingOffer` is cleared at the end of that turn, whatever the outcome.
- The history only holds prose, so later turns see the old question text but no live offer.
  The prompt states that only the listed pending offer can be accepted.

This is still prompt-enforced at the moment of decision. The model could misread "yes, give me
the snapshot of X" as acceptance. A `test:live` case covers that phrasing.

## 8. Tools

All tools operate on the session's watchlist. Results are JSON returned to the model.

### `list_watchlist()`

Returns `{ symbols }`.

### `add_symbols({ symbols: string[] })` — 1–10 symbols

- Normalises each symbol (trim, uppercase).
- Validates it against Alpaca `GET /v2/assets/{symbol}`: it must exist, have `status=active`,
  `tradable=true` and class `us_equity`.
- Per-symbol result: `added`, `already_present`, `invalid`, `not_tradable` or `cap_reached`.
  Partial success is allowed.
- Emits `watchlist` if anything changed.

### `remove_symbols({ symbols: string[] })` — 1–10 symbols

- Per-symbol result: `removed` or `not_present`.
- Emits `watchlist` if anything changed.

### `get_snapshots({ symbols?: string[] })` — 1–10 symbols

- Defaults to the whole watchlist.
- Symbols that aren't on the watchlist are allowed. They are validated against `/v2/assets`
  first (same rules as `add_symbols`) and come back as `invalid` or `not_tradable` if they
  fail. Watchlist symbols skip validation.
- Makes one batched Alpaca call: `GET /v2/stocks/snapshots?symbols=…&feed=iex`.
- Emits a `snapshots` event with the rows the server computed, each flagged `onWatchlist`, and
  returns the same rows to the model.

### `get_price_history({ period, symbols? })` — 1–10 symbols

- `period` is one of `1w`, `1m`, `3m`, `6m`, `ytd` or `1y`, and is required. Symbols default
  to the whole watchlist and are checked like `get_snapshots`.
- **Data:** split-adjusted daily bars from all US exchanges (SIP). The request ends at least
  sixteen minutes ago, which the free plan allows.
- **Each row** is computed on the server:
  - the start price, which is the last close before the period, falling back to the first
    open in it;
  - the latest close, the change and the % change;
  - the period's high and low.
- **Output:** emits a `history` event and the client renders it as a table. The caption names
  the exact date range, says the data is delayed, and points to a brokerage for real-time
  prices.

### `respond({ symbols: string[], prose: string })`

- Terminal tool that ends the turn.
- `symbols` are the symbols the answer is about. They must be a subset of the symbols fetched
  or changed this turn.
- `prose` goes through the figure check (§7.1).

Adding plural symbols in one call lets "add QQQ and NET" take one tool call instead of two,
which matters for latency and neurons.

### SnapshotRow (all fields computed server-side, never by the LLM)

```ts
{
  symbol: string;
  onWatchlist: boolean;
  price: number | null;          // latestTrade.p
  tradeTime: string | null;      // latestTrade.t (ISO)
  prevClose: number | null;      // prevDailyBar.c
  change: number | null;         // price - prevClose
  changePct: number | null;      // change / prevClose * 100
  dayOpen, dayHigh, dayLow: number | null;   // dailyBar
  dayVolume: number | null;      // dailyBar.v (IEX only — labelled in UI)
  bid, ask: number | null;       // latestQuote
}
```

## 9. Starter list (QQQ top 10)

- The list is hardcoded in a single module, with an `asOf` date:
  `NVDA, AAPL, MSFT, MU, AMZN, AMD, META, GOOGL, TSLA, SPCX`.
  - GOOG is deliberately excluded in favour of SPCX.
  - QQQ itself is excluded: the list is aimed at people without a watchlist of their own.
- Sourcing the list dynamically is a possible future iteration.
- `POST /api/watchlist/starter` writes it directly. It doesn't call the LLM, and it doesn't
  check the symbols against the assets endpoint at runtime.
- `test:live` asserts that every starter symbol is active and tradable on Alpaca, so a stale
  or wrong symbol (e.g. if SPCX isn't listed on Alpaca under that ticker) is caught there
  rather than in production.

## 10. Voice input

- `getUserMedia({ audio: true })` + `MediaRecorder`, using the browser's native container
  (Firefox: ogg/opus).
- The client decodes the recording (`AudioContext.decodeAudioData`), downmixes to mono,
  resamples to 16 kHz and encodes 16-bit PCM WAV. That's about 32 KB/s, or about 1 MB at the
  30 s cap. The server only ever sees WAV.
- The server sends it to Whisper with `initial_prompt` priming for ticker symbols, e.g.
  "Stock tickers: QQQ, NET, AAPL, NVDA."
- The transcript fills the chat input and is not auto-sent.
- Mic permission denied or no device → inline message; text input still works.

## 11. Errors

All errors surface as a typed `code` with a human-readable message. The client maps codes to
UI states.

| Code                       | Cause                               | User sees                                             |
|----------------------------|-------------------------------------|-------------------------------------------------------|
| `ai_quota_exhausted`       | Workers AI daily neuron limit       | "The daily AI budget is used up. Try again tomorrow." |
| `ai_error`                 | Other Workers AI failure            | "The assistant had a problem. Try again."             |
| `market_data_error`        | Alpaca 5xx / network                | Tool result error → the model explains; also logged   |
| `market_data_rate_limited` | Alpaca 429                          | Same as above, with "try again in a moment"           |
| `loop_limit`               | 5 iterations without a final answer | "I got stuck on that one. Try rephrasing."            |
| `rate_limited`             | Session over 10/min                 | "Slow down a little." (+ retry-after)                 |
| `transcription_failed`     | Whisper error / empty transcript    | "Couldn't make that out. Try again or type it."       |
| `no_session`               | Missing/unknown cookie              | Landing gate                                          |
| `internal_error`           | Unexpected server failure mid-turn  | "Something went wrong. Please try again."             |

Alpaca failures inside a tool are returned to the model as tool errors, so it can explain them.
AI failures end the request with an `error` event.

## 12. History

- **Server (DO):** the last **10 exchanges**, as user text + final assistant text only. Tool
  calls and results are not stored, so the model always fetches fresh data. This is LLM context
  only, with no admin view.
- **Client (localStorage):** the last **200 messages**, including rendered snapshot tables
  (with `asOf`). Used for display only.
- **Transcript divider:** the transcript shows a divider where the assistant's memory ends
  ("Older messages aren't in the assistant's memory").
- **localStorage failures:** all access is wrapped in try/catch, and the app works without it.

## 13. Configuration

### Secrets

Set with `wrangler secret put` in production and in a gitignored `.dev.vars` locally. They are
never pasted into chat.

- `ALPACA_API_KEY`
- `ALPACA_SECRET_KEY`
- `TURNSTILE_SECRET_KEY`

### Vars

- `TURNSTILE_SITE_KEY`
- `ALPACA_DATA_BASE_URL` (`https://data.alpaca.markets`)
- `ALPACA_TRADING_BASE_URL` (`https://paper-api.alpaca.markets`, for `/v2/assets`)

### Bindings

- `AI` (Workers AI)
- `SESSION` (Durable Object, SQLite backend)
- static assets

### Routing and Turnstile

- **Route:** custom domain `watchlist.fetchlogic.com`.
- **Turnstile widget hostnames:** `watchlist.fetchlogic.com` and `localhost`.

## 14. Tooling and testing

- **Toolchain:**
  - npm
  - TypeScript (strict)
  - Biome (lint + format)
  - Vite + `@cloudflare/vite-plugin`
  - `wrangler` as a dev dependency
- **TDD:** tests are written before implementation for every unit.
- **`npm test` (default, deterministic, offline):**
  - Uses `@cloudflare/vitest-plugin`, which runs in workerd with real DO storage.
  - The Workers AI binding is faked with scripted model responses: good tool calls, malformed
    args, unknown tools, runaway loops, quota errors.
  - Alpaca and Turnstile are mocked at the fetch layer. Turnstile also has official test keys
    for always-pass and always-fail.
  - Frontend logic is kept in pure modules and tested with Vitest in a DOM environment: WAV
    encoder, SSE parser, history store, and the error-code → UI mapping.
- **`npm run test:live` (opt-in, repeatable, hits real services, costs neurons):**
  - Checked-in audio fixtures (including a Firefox ogg recording converted through our WAV
    path) → Whisper → assert the expected tickers appear.
  - A fixed set of prompts → real Llama → assert the expected tool calls.
  - Real Alpaca contract checks for the assets and snapshots response shapes, plus a check
    that every starter symbol is active and tradable.
  - Figure-check rates: across a fixed set of data questions, measure how often the first
    `respond` contains digits and how often a turn hits `loop_limit`.
  - Pending offer:
    - "yes" on the next message adds the symbol.
    - "yes, give me the snapshot of X" does not add the offered symbol.
    - A "yes" two messages later does nothing.
  - This is where the early "spike" questions get answered, and it stays in the repo as a
    regression suite.
- **Deferred:** Playwright/e2e.

## 15. Open items

None at this time.
