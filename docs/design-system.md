# Design system

One token set, three densities. Build it in phase 1 and never hardcode a value afterwards.

## Principle
The guardian portal, cafeteria POS, and admin console share every colour, component, and spacing step. They differ only in density. This gives visual coherence without pretending a cashier and a finance clerk need the same interface.

| Surface | Scale | Why |
|---|---|---|
| Cafeteria POS | 1.4× | Read across a serving counter; 48px minimum targets |
| Guardian portal | 1.0× | Parent on a phone; calm and roomy |
| Admin console | 0.85× | Dense tables and long lists |

Implement as a `data-density` attribute on the route group layout driving a CSS variable multiplier. Components never hardcode a density.

## Colour tokens
```css
--ink:          #0F1F33;  /* primary text, POS confirmation surface */
--ink-muted:    #24405F;  /* secondary text, outline button text */
--brand:        #0D6E63;  /* primary actions */
--brand-wash:   #E3F2EF;  /* selected states, subtle fills */
--surface:      #FAF8F4;  /* app background */
--surface-card: #FFFFFF;
--border:       #E3DFD7;
--control-border:#918D85; /* input/button boundary, 3.31:1 on white */
--success:      #25663F;  /* meal recorded, deposit complete; 5.94:1 on success wash */
--warn:         #855300;  /* low balance; 5.55:1 on warn wash */
--danger:       #B3261E;  /* denied, insufficient balance */
```
White on `--brand` and on `--ink` both pass WCAG AA. `--border` remains a quiet divider; use `--control-border` for input and button boundaries that need 3:1 non-text contrast. Never place `--warn` or `--danger` text on a coloured fill — use the wash pattern (light tint background, dark same-family text).

Rule: every state carries an icon and a word, never colour alone.

## Typography
System stack or Inter. Two weights only — 400 and 500. Base 16px at 1× density.
Scale: 12 / 14 / 16 / 20 / 24 / 30 / 38, multiplied by the surface density.
Money always uses tabular numerals (`font-variant-numeric: tabular-nums`) so ledger columns align.

## Spacing and shape
4px base scale: 4, 8, 12, 16, 24, 32, 48. Radius 8px for controls, 12px for cards, 999px for status pills.

## Core components

### Button
Variants: primary (brand fill), secondary (outline, ink-muted text), ghost, danger.
States: default, hover, active, focus-visible (2px offset ring), disabled (opacity, `aria-disabled`), loading (spinner replaces label, width preserved, `aria-busy`).
Sizes follow density automatically. POS buttons are minimum 48×48.

### Money display
Props: `amountCents`, `sign`. Always renders from integer cents; never accepts a float. Negative amounts show a minus and `--danger` text, positive a plus and `--ink`. Tabular numerals always.

### Balance card (guardian)
Child name, grade, school, balance, status pill, and two actions. Status pill is one of: healthy (no pill), low balance (warn wash + triangle icon), negative (danger wash + circle icon). Never displays eligibility.

### POS confirmation
Full-bleed ink surface, large success icon, "Meal recorded", student name and grade, auto-reset countdown. Result variants: recorded (success), duplicate (warn), not active at this school (warn), insufficient balance (danger — a-la-carte only). Every variant shows a plain sentence, never a code. Never shows price category or eligibility.

### Ledger table (admin)
Columns: date, description, type badge, amount, running balance, actor. Corrections render linked to their original entry with a visible relationship, never as a replacement. Sortable headers are real buttons with `aria-sort`.

### Reason dialog
Blocks any adjustment, reallocation, refund, or override. Required free-text reason, minimum length enforced server-side. Cannot be dismissed by clicking outside. Focus trapped, returns focus to trigger on close.

### Prototype banner
Persistent, top of every layout, on every surface including printed and exported output. Exact text: `PROTOTYPE — SYNTHETIC DATA. Not connected to Infinite Campus, PCS, or live payment processing.`

## Accessibility rules (non-negotiable)
- Every interactive element reachable and operable by keyboard, in visual order.
- `:focus-visible` ring on everything focusable — never `outline: none` without a replacement.
- WCAG AA contrast minimum; verify the warn and danger washes specifically.
- All inputs have real `<label>` elements; placeholder is never the only label.
- Status changes announced through a polite live region — the POS result must be readable by a screen reader, not just visible.
- Touch targets: 48px on POS, 44px elsewhere.
- No information conveyed by colour alone, anywhere.

## Do and don't
| Do | Don't |
|---|---|
| Read every value from a token | Hardcode a hex or px value in a component |
| Let density flow from the layout | Build a separate POS button component |
| Show a word beside every colour state | Rely on a red or green dot |
| Use shadcn/ui as the base | Pull core components from 21st.dev |
