---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/client/main.ts"]
---

# App shell (gate + signed-in workspace)

## Scope
- **Mode:** Operate.
- **Surfaces:** the landing gate (disclaimer + Turnstile) and the signed-in shell.
- **Shell slots:** a watchlist card, the conversation area (snapshot tables and assistant
  messages), and a pinned input bar.
- **Future work** (watchlist, chat, tables, voice) fills these slots and inherits this world.

## Audience and job
- **Who:** non-traders on a desktop browser in the daytime.
- **Job:** set up a small watchlist, then ask plain questions about it.
- **Avoid:** trading terminal, generic chatbot, fintech gloss, anything too playful.

## Direction contract
THESIS: Soft cards and plain words, with one bright colour only where you can act. It refuses
the category default of a dense finance dashboard beside a chat-bubble panel.

OWN-WORLD: A warm tinted ground with white, soft-cornered cards (large radius, generous
padding, one idea per card). Type is a rounded humanist sans (Figtree), with tabular figures
for data. Warm near-black ink. A single saturated blue is the action colour, used only on
things you can press. Up and down use muted green and red, always paired with a +/− sign.

STORY: The visitor understands it is a friendly place to keep an eye on a few stocks, believes
the numbers come from data rather than the assistant, and knows where to type or speak next.

FIRST VIEWPORT: Desktop. A header row holds "Watchlist Agent" on the left and the Log out
action on the right. Below it is one centred column, about 760px wide:
- the watchlist card (symbol pills, or an empty state);
- the conversation card (messages, snapshot tables as their own cards with a plain-language
  key);
- the input bar, pinned to the viewport bottom, holding the text field, mic and Send. Send is
  the primary action.

The gate is a single centred card: name, disclaimer, the "I understand" checkbox, Turnstile,
and Continue as the only accented control.

FORM: Dealt challenger "Warm Consumer App" (digital-design-canon-warm-consumer-app-surface),
chosen by the user over the assigned Box Score (grounded #6) and the pick (grounded #1).
seed: ba1077f544e58aaa

SIGNATURE: The action-only accent. Blue appears only on actionable elements (Continue, Send,
the mic, the starter button). Disabled controls lose the colour entirely, so what's possible
right now reads at a glance.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- The exact empty-state copy for the conversation before chat exists.
- Snapshot table card details, to settle when Phase 5 lands.
