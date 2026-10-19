---
name: Watchlist Agent
description: Soft cards and plain words, with one bright colour only where you can act.
colors:
  ground: "#f5efe8"
  card: "#ffffff"
  ink: "#24211d"
  ink-soft: "#5e574e"
  line: "#e7ddd1"
  muted-fill: "#eee6dc"
  action: "#3b5bdb"
  action-ink: "#ffffff"
  action-hover: "#2f4bc0"
  focus: "#3b5bdb"
  danger: "#b4442f"
  danger-tint: "#f8e7e3"
  danger-ink: "#7d2c1c"
  disabled-ink: "#9a8f82"
  placeholder: "#766b5e"
  selection: "#d6ddfa"
  up: "#2f7a4d"
  down: "#b4442f"
typography:
  display:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "2.625rem"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 650
    lineHeight: 1.5
  body:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.5
  symbol:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "0.02em"
    fontFeature: "tnum"
  fine-print:
    fontFamily: "Figtree Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  focus: "6px"
  control: "14px"
  card: "20px"
  composer: "22px"
  pill: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "7": "3rem"
  column: "46rem"
components:
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.5}"
  card-gate:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "{spacing.6}"
    width: "min(100%, 30rem)"
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 1.5rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.action-ink}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 1.5rem"
    height: "2.75rem"
  button-quiet-hover:
    backgroundColor: "{colors.muted-fill}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 1.5rem"
    height: "2.75rem"
  button-danger-hover:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger}"
  button-disabled:
    backgroundColor: "{colors.muted-fill}"
    textColor: "{colors.disabled-ink}"
    rounded: "{rounded.control}"
  button-icon:
    rounded: "{rounded.control}"
    padding: "0"
    size: "2.75rem"
  pill:
    backgroundColor: "{colors.muted-fill}"
    textColor: "{colors.ink}"
    typography: "{typography.symbol}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem"
  alert:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.control}"
    padding: "0.75rem 1rem"
  inline-confirmation:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.card}"
    padding: "0.75rem 0.75rem 0.75rem 1rem"
  inset-panel:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "{spacing.4}"
  composer-bar:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.composer}"
    padding: "{spacing.2}"
    width: "min(100%, 46rem)"
  composer-input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "2.75rem"
---

# Design System: Watchlist Agent

## Overview

**Creative North Star: "The Warm Consumer App"**

A friendly place to keep an eye on a few stocks. The page sits on a warm, paper-tinted ground; everything the visitor reads or uses lives on white, softly lifted, generously rounded cards, one idea per card. Type is a single rounded humanist sans (Figtree) in plain sentence case, with tabular figures wherever a number or symbol appears. Ink is a warm near-black, never pure black.

Colour is spent sparingly and with meaning. A single saturated blue marks the thing you can do right now and nothing else; when that thing is not yet possible, the blue disappears entirely. Destructive consequences get a muted brick red, always as text, outline or a pale tint, never as a solid fill. Everything else is warm neutrals.

Density is relaxed: one centred column about 46rem wide, a 44px touch floor on every control, and a pinned composer at the bottom so the visitor always knows where to type or speak next. It deliberately refuses the dense finance dashboard and the generic chat-bubble panel.

**Key Characteristics:**
- Warm tinted ground, white soft cards with a faint warm shadow and no borders.
- One action colour (blue), used only on enabled primary actions.
- Disabled controls go neutral: muted fill, muted ink, no accent.
- One typeface (Figtree Variable, self-hosted), weights 400 / 600 / 650 / 700.
- Tabular figures on counts and symbols.
- Concentric, generous radii: 14px controls inside 20px cards, full pills for symbols.

## Colors

A warm neutral world with one blue voice for action and a muted brick red for consequence.

### Primary
- **Action Blue** (`action`): fill of the enabled primary button (Continue, Send). Also the focus ring (`focus`), caret colour and native `accent-color` (the checkbox tick). White label on it (`action-ink`) at 5.7:1.
- **Pressed Blue** (`action-hover`): hover fill of the primary button only.

### Secondary
- **Brick Red** (`danger`): label and 1px inset outline of the destructive button. Never a solid fill.
- **Blush Tint** (`danger-tint`): background of the error alert, the inline logout confirmation, and the destructive button's hover.
- **Deep Brick** (`danger-ink`): text on Blush Tint (7.8:1).

### Tertiary (data, declared but not yet rendered)
- **Muted Gain Green** (`up`) and **Muted Loss Red** (`down`): declared in `:root` for price movement. No shipped surface uses them yet; `down` shares its value with `danger`. Provisional until the snapshot tables land.

### Neutral
- **Warm Paper** (`ground`): page background, composer band, and the inset disclaimer panel inside the gate card.
- **Card White** (`card`): every card and the composer bar.
- **Warm Ink** (`ink`): all primary text (16:1 on card, 14:1 on ground).
- **Soft Ink** (`ink-soft`): secondary text, counts, fine print (7.1:1 on card).
- **Hairline Sand** (`line`): the 1px inset outline of the quiet button. Not used as a card border.
- **Oat Fill** (`muted-fill`): symbol pills, quiet-button hover, and the disabled-button fill.
- **Faded Ink** (`disabled-ink`): label of disabled buttons only.
- **Placeholder Taupe** (`placeholder`): composer placeholder text (5.2:1 on card).
- **Selection Wash** (`selection`): text selection background, with ink text.

Note: `danger-tint`, `danger-ink`, `disabled-ink`, `placeholder` and `selection` are hex literals in the stylesheet rather than `:root` custom properties; the values here are the shipped ones.

### Named Rules
**The Action-Only Accent Rule.** Blue appears only on things that can be pressed right now and that are the primary action of their context. Quiet controls (Log out, Cancel, the mic) stay neutral. A disabled control loses the blue entirely, so what is possible reads at a glance.

**The No Solid Red Rule.** Destructive and error states are tints and outlines: Blush Tint backgrounds with Deep Brick text, or a Brick Red outline and label. Nothing destructive is filled solid.

## Typography

**Display Font:** Figtree Variable (with system-ui, sans-serif)
**Body Font:** Figtree Variable (same family)

**Character:** One rounded humanist sans carries everything; hierarchy comes from size and weight steps (400 to 700), not from a second face. Friendly without being playful.

### Hierarchy
- **Display** (650, 2.625rem, 1.1, -0.02em, balanced wrap): the product name on the gate card only.
- **Headline** (700, 1.375rem, -0.01em): the app name in the signed-in header.
- **Title** (650, 1.0625rem): card headings ("Your watchlist", empty-state headings).
- **Body** (400, 1rem, 1.5, pretty wrap): all running text. The column caps line length.
- **Meta** (400, 0.9375rem, tabular figures, Soft Ink): counts beside a card heading ("3 of 10").
- **Label** (650, 1rem): button labels. The checkbox label uses 600.
- **Symbol** (650, 1rem, +0.02em, tabular figures): ticker symbols in pills.
- **Fine Print** (400, 0.8125rem, Soft Ink): the line under the composer.

### Named Rules
**The Tabular Numbers Rule.** Any count, symbol or figure uses `font-variant-numeric: tabular-nums`, so data aligns and reads as data rather than prose.

**The Sentence Case Rule.** No uppercase labels, no small-caps kickers above headings. Headings are plain sentence-case words.

## Layout

A single centred column. The header and main area are `min(100%, 46rem + 2rem)` wide with 1rem side padding; the composer bar is `min(100%, 46rem)`. The shell is a three-row grid (header, main, composer): main stacks cards with a 1rem gap, and the conversation card grows to fill the remaining height (minimum 12rem).

The composer is `position: sticky` at the bottom on a Warm Paper band (padding 0.75rem 1rem 1rem), so the input is always in reach.

The gate is a single card centred in the viewport (`place-items: center`), max 30rem wide, with 2rem outer padding.

Spacing follows a seven-step rem scale (0.25 to 3rem). Inside a card, consecutive children are separated by 0.75rem; card padding is 1.5rem (2rem on the gate card). Header and confirmation rows wrap rather than squeeze.

Responsive: one breakpoint at 30rem. Below it, Send collapses to a 44px icon-only square and keeps "Send" as visually hidden text. The gate also tightens below 30rem (outer padding 1.5rem/0.75rem, card padding 1.5rem/1rem) so Turnstile's fixed 300px minimum fits at 375px. Below 22.25rem the widget renders in its compact size, chosen at render time.

## Elevation & Depth

Hybrid: tonal layering does most of the work (white cards on warm ground), with one soft, warm-tinted ambient shadow to lift cards off the paper. No borders on cards.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 1px 2px rgb(60 40 20 / 0.06), 0 6px 18px rgb(60 40 20 / 0.06)`): every card and the composer bar. The shadow is tinted warm brown, never neutral grey or black.
- **Hairline inset** (`box-shadow: inset 0 0 0 1px var(--line)`): the quiet button's outline. The danger button uses the same 1px inset in `var(--danger)`. Inset shadows rather than borders keep control sizes identical across variants.

### Named Rules
**The One Shadow Rule.** There is a single elevation level. Nested surfaces (disclaimer panel, alert, confirmation) are flat tints, not further lifted.

## Shapes

Generous, concentric rounding. Controls are 14px; cards are 20px; the composer bar is 22px (control radius plus its 8px padding) so the inner field and buttons sit concentric. Symbols are full pills. Inner tinted panels (disclaimer, alert) take the control radius; the full-width logout confirmation row takes the card radius. Icons are inline Lucide-style SVG on a 24px grid, 2px round-capped stroke, drawn at 20px in `currentColor`.

## Components

### Buttons
Soft, confident, and calm: rounded rectangles with a 44px touch floor and a gentle press.
- **Shape:** gently rounded (14px), min height 2.75rem, horizontal padding 1.5rem, 0.5rem gap between icon and label. Icon-only buttons are 2.75rem square.
- **Primary:** Action Blue fill, white label. Exactly one per context (Continue on the gate, Send in the composer). Hover deepens to Pressed Blue. On the gate it spans the card width.
- **Quiet:** transparent with a 1px Hairline Sand inset outline and ink label; hover fills with Oat. Used for Log out, Cancel and the mic. Inside the Blush confirmation it sits on Card White so it reads as a button.
- **Danger:** transparent with a 1px Brick Red inset outline and Brick Red label; hover fills with Card White, which reads against the Blush confirmation row it sits on.
- **Disabled (all variants):** Oat fill, Faded Ink label, outline removed, `not-allowed` cursor. Hover and press effects are suppressed.
- **Press:** `scale(0.97)` over 160ms with `cubic-bezier(0.16, 1, 0.3, 1)`; background colour transitions on the same curve. Both are removed under `prefers-reduced-motion`.
- **Focus:** global 3px solid Action Blue outline, 2px offset.

### Chips (symbol pills)
- **Style:** Oat fill, ink text, full pill radius, padding 0.25rem 0.75rem, Symbol typography. No border.
- **Layout:** wrapping flex list with 0.5rem gaps. Pills are display-only today; no selected or interactive state exists yet.

### Cards / Containers
- **Corner Style:** 20px.
- **Background:** Card White on Warm Paper.
- **Shadow Strategy:** Card lift (see Elevation).
- **Border:** none.
- **Internal Padding:** 1.5rem (2rem on the gate card); 0.75rem between stacked children.
- **Card heading row:** Title on the left, Meta count on the right, baseline-aligned.
- **Inset panel:** a Warm Paper block inside a card (radius 14px, padding 1rem) for secondary but required reading, such as the disclaimer.

### Inputs / Fields
- **Composer:** a Card White bar with Card lift, 22px radius and 0.5rem padding, holding a borderless transparent text field (min height 2.75rem, 0.75rem side padding, Placeholder Taupe placeholder) followed by the quiet mic icon button and the primary Send button. The field has no stroke of its own; the bar is the field.
- **Checkbox:** native control at 1.25rem, tinted by `accent-color` (Action Blue), label at weight 600 with a 0.75rem gap.
- **Disabled:** the field keeps its look and takes a `not-allowed` cursor; the buttons beside it go to the disabled treatment.

### Alerts
- **Error alert:** Blush Tint background, Deep Brick text, 14px radius, padding 0.75rem 1rem, `role="alert"`. Placed directly below the action it reports on.
- **Inline confirmation:** destructive confirmation replaces the triggering button in place instead of opening a modal. A full-width Blush Tint row (20px radius) with the consequence in Deep Brick at weight 600, then Cancel (quiet, on white) and the danger button. Focus moves to Cancel on open and back to the trigger on cancel.

### Navigation
- **Header:** app name (Headline) on the left, Log out (quiet button with icon) on the right, wrapping when space runs out. No other navigation exists.

## Do's and Don'ts

### Do:
- **Do** put every new surface on a Card White card with the 20px radius, Card lift and 1.5rem padding, one idea per card.
- **Do** reserve Action Blue for the single enabled primary action in a context; let disabled controls drop to Oat fill and Faded Ink.
- **Do** use tabular figures for every count, symbol and number.
- **Do** keep controls at least 2.75rem tall and keep radii concentric (14px inside 20px).
- **Do** express errors and destructive steps as Blush Tint with Deep Brick text, or a Brick Red outline.
- **Do** pair up/down colour with an explicit + or − sign, never colour alone (provisional until data surfaces ship).

### Don't:
- **Don't** use Action Blue for decoration, headings, links-as-ornament, icons at rest, or quiet controls.
- **Don't** fill a button solid red.
- **Don't** add borders to cards or a second shadow level; nested surfaces are flat tints.
- **Don't** introduce a second typeface, uppercase labels or small-caps kickers above headings.
- **Don't** use pure black text or neutral grey shadows; ink and shadow are warm.
