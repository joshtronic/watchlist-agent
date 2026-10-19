# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People without a watchlist of their own, and often without a trading background, who want to
follow a handful of stocks and ask plain-language questions about them. They may not know
tickers well or what to look for. That's why onboarding offers QQQ's top 10 holdings as a
one-click starter list rather than asking them to name symbols.

## Product Purpose

Watchlist Agent lets someone keep a small watchlist (up to 10 US stocks or ETFs) and talk to it
by text or voice: add or remove symbols, list them, and ask how they're doing. An LLM runs a
tool-calling loop against real market data to manage the list and answer.

It's an internal proof of concept. Success means it works as a **showcase piece**: a credible
demonstration, worth showing people at `watchlist.fetchlogic.com`, of an agent that uses tools
and keeps the market data it shows untainted.

## Positioning

The model never supplies the numbers. Every price, change and percentage on screen comes
straight from the market data tool results and is rendered as data, not prose. The model's
text is checked and reprompted if it contains any digits. The conversation is the interface,
but the data is never the model's to state.

## Operating Context

- **Landing gate:** visitors pass a human check (Cloudflare Turnstile) and accept a disclaimer
  before anything is stored.
- **Sessions:** a one-year cookie, with no accounts.
- **Expected use:** one or two people at a time.
- **Data:** Alpaca's free tier, **IEX feed only**. Volume is a fraction of the full market, and
  outside market hours the data is the last trade. Timestamps matter.
- **Voice input:** speech is transcribed into the text box for the user to review, never sent
  automatically. The primary development browser is Firefox.
- **Daily AI budget:** responses can be slow (multi-step tool loops), and the budget can run out
  for the day; both need graceful states.

## Capabilities and Constraints

- **Watchlist:** max 10 symbols, US stocks and ETFs only (no crypto).
- **Tools:** add, remove and list symbols, and get snapshots. Snapshots can also cover a
  one-off symbol that isn't on the list, followed by an offer to add it that is only valid for
  the user's next message.
- **v1 market data:** snapshots only. No historical bars or news.
- **No financial advice, ever.** The assistant declines buy/sell/hold questions and offers
  factual data instead.
- **History:** the server keeps the last 10 exchanges as context for the model; the browser
  keeps a longer display history. The UI marks where the assistant's memory ends.
- **Logout** permanently deletes the watchlist and history after an in-page confirmation.
- **Spec:** `docs/spec.md` is the source of truth for behaviour.
- **Undecided / out of scope for v1:** spoken replies, live-updating prices, accounts, and a
  Bloomberg-terminal style layout. The last one was shelved, to be approached as its own effort
  later.

## Brand Commitments

- The product name is **Watchlist Agent**.
- Nothing else is fixed: no logo, palette, voice guide, or fetchlogic branding to carry.

## Evidence on Hand

- A working deployment at `https://watchlist.fetchlogic.com`: the landing gate, sessions and
  logout are live.
- No users, testimonials, metrics or press exist. Don't fabricate any.

## Product Principles

1. **Data is never the model's to state.** Numbers come from tools and render as data.
2. **Plain language for non-traders.** Assume no jargon fluency; explain rather than abbreviate.
3. **Honest about limits.** Make the IEX-only feed, stale out-of-hours data, AI budget and
   assistant memory visible rather than hidden.
4. **Nothing stored until consent.** No cookie before the disclaimer is accepted; logout
   genuinely deletes.
5. **Never advice.** Inform, never recommend.
