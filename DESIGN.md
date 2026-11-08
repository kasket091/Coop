---
name: Hilas Coop
description: The coop's 2026 handbook as a member app, showing each member's locked year, loan room and December payout.
colors:
  handbook-navy: "#1c1b57"
  navy-pressed: "#2a2973"
  year-cyan: "#09c3e4"
  fine-print-red: "#a42a24"
  red-wash: "#f8ebea"
  red-deep-text: "#6e1c18"
  handbook-cream: "#f2f0e2"
  cream-pressed: "#e8e5d2"
  page-white: "#ffffff"
  ink: "#1a1936"
  muted-ink: "#55536e"
  ledger-line: "#d4d0b8"
  navy-subtext: "#d6d5ee"
typography:
  display:
    fontFamily: "Anton, 'Arial Narrow', sans-serif"
    fontSize: "56px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.01em"
  display-secondary:
    fontFamily: "Anton, 'Arial Narrow', sans-serif"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 1.05
  year-mark:
    fontFamily: "Anton, 'Arial Narrow', sans-serif"
    fontSize: "20px"
    fontWeight: 400
    letterSpacing: "0.45em"
  headline:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  focus: "4px"
  cell: "8px"
  md: "10px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.handbook-navy}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.navy-pressed}"
  button-copy:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.handbook-navy}"
    rounded: "{rounded.md}"
    height: "44px"
    width: "76px"
  button-copy-hover:
    backgroundColor: "{colors.cream-pressed}"
  input-field:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "48px"
  panel:
    backgroundColor: "{colors.handbook-cream}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  payout-card:
    backgroundColor: "{colors.handbook-navy}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.md}"
    padding: "18px 16px"
  alert:
    backgroundColor: "{colors.red-wash}"
    textColor: "{colors.fine-print-red}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  year-cell-open:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.cell}"
    height: "64px"
  year-cell-paid:
    backgroundColor: "{colors.handbook-navy}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.cell}"
    height: "64px"
  year-cell-missed:
    backgroundColor: "{colors.fine-print-red}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.cell}"
    height: "64px"
  year-cell-due:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.handbook-navy}"
    rounded: "{rounded.cell}"
    height: "64px"
  band:
    backgroundColor: "{colors.handbook-navy}"
    textColor: "{colors.page-white}"
    padding: "10px 16px"
  tab-bar:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.muted-ink}"
    height: "64px"
---

# Design System: Hilas Coop

## Overview

**Creative North Star: "The Handbook Page"**

The app wears the coop's own 2026 handbook as its shell: a navy page band carrying the circle-of-people logo, the words HILAS COOP and a tracked cyan "2 0 2 6", over a plain white page with cream ledger panels. Nothing is borrowed from fintech conventions. The brand is pinned by the handbook (PRODUCT.md Brand Commitments) and the build follows it closely; there is no second palette and no decorative layer.

Density is low and type is large, because the audience reads on cheap Android phones and includes older relatives. Every content block sits on one 640px column with 16px gutters. Numbers carry the hierarchy: money figures and the year mark are set in Anton, and everything else is Montserrat in a single 16px/1.5 body voice with tabular numerals throughout. The signature is the year strip: twelve cells, one per month, each paid (navy), missed (red), next due (dashed navy) or still to come (white).

**Key Characteristics:**
- Navy band on top, white tab bar fixed at the bottom, white ground between, cream panels for grouped facts.
- Anton only for money totals and the year mark; Montserrat for all UI.
- Navy does all the interactive work: links, buttons, focus, the active tab label, the next-due cell.
- Red appears only for missed months, warnings and fine print.
- Cyan appears only on navy (year mark, payout figure, focus ring inside navy blocks) and as the active-tab indicator and selection highlight.
- Flat: depth is tonal and drawn with lines, never with shadows.

## Colors

Three handbook inks (navy, cyan, red) on a white and cream paper stock, with one ink-navy text color.

### Primary
- **Handbook Navy**: the page band, primary buttons, link text, section headings, row values, paid cells, the next-due outline, the payout card, the focus ring on light surfaces and the browser theme color. It is the app's one voice for structure and action.
- **Navy Pressed**: hover state of the primary button only.

### Secondary
- **Year Cyan**: the tracked "2 0 2 6" mark, the payout and dividend figure on navy, the 3px active-tab indicator, text selection, the focus ring inside navy blocks, and (at 35% alpha) the focus glow on inputs. Not used as text on white.

### Tertiary
- **Fine-Print Red**: missed cells, alert headings and text, and italic fine print. Never decorative, never a button.
- **Red Wash**: the alert background.
- **Red Deep Text**: alert body copy on the wash.

### Neutral
- **Page White**: the content ground, the tab bar, inputs, open year cells and the copy button.
- **Handbook Cream**: grouped panels (fact rows, the member list, payment channels) and skeleton loaders.
- **Cream Pressed**: hover and pressed state of cream list rows and the copy button; the skeleton shimmer.
- **Ink**: body text.
- **Muted Ink**: row labels, notes, inactive tab labels, open-cell month names, the legend.
- **Ledger Line**: every 1px rule and 1.5px field or cell border; chosen to stay visible on both cream and white.
- **Navy Subtext**: secondary lines inside the navy payout card.

### Named Rules
**The Three Inks Rule.** Navy, cyan and red come from the handbook and nothing else is added. Navy is for structure and action, red is for money a member owes, cyan is for the year mark and for highlights on navy.

**The Red Means Owed Rule.** Red marks only missed contributions, over-limit warnings, loan errors and fine print. A red button or decoration breaks the meaning.

## Typography

**Display Font:** Anton (with Arial Narrow, sans-serif)
**Body Font:** Montserrat (with system-ui, sans-serif), self-hosted at weights 500, 600 and 700

**Character:** A condensed poster face for the figures a member came to see, set beside a friendly geometric sans for everything they read. Tabular numerals are on for the whole page so peso amounts line up.

### Hierarchy
- **Display** (Anton 400, 56px, line-height 1): the member's total saved. The loan quote installment uses the same face at 40px.
- **Display Secondary** (Anton 400, 44px, line-height 1.05, cyan on navy): the projected payout and dividend per head.
- **Year Mark** (Anton 400, 20px, letter-spacing 0.45em, cyan): "2026" in the band, with negative right margin to cancel the trailing tracking.
- **Headline** (Montserrat 700, 22px, line-height 1.2, navy): page titles (member name, "Loan calculator", "How to pay"). The name picker uses 24px.
- **Title** (Montserrat 700, 15px, navy): section headings above panels and inside the payout card.
- **Body** (Montserrat 500, 16px/1.5, tabular numerals): all running text and row content.
- **Label** (Montserrat 600, 14px): field labels (navy), notes and secondary row text (muted, 500). Tab labels are 13px 600.

### Named Rules
**The Anton Is Money Rule.** Anton sets peso figures and the year mark only. Headings, labels and buttons are Montserrat.

## Layout

Single column, phones first. Content sits in a 640px centered column with 16px side padding; the band and tab bar use a computed gutter (`max(16px, (100vw - 640px)/2 + 16px)`) so their contents line up with that column on wide screens while their backgrounds bleed to full width. The band is sticky at the top and respects the top safe area; the tab bar is fixed at the bottom (64px plus bottom safe area) with four equal columns, and the main area pads its bottom to clear it.

Rhythm: 6px inside tight groups (strip gap, field label to input), 12–16px for row and card padding, 20px between blocks on the savings page, 28px before each section. The year strip is a 6-column grid (two rows of six) below 560px and a 12-column single row from 560px up.

## Elevation & Depth

There are no shadows. Depth comes from tone (navy band and payout card against white, cream panels against white) and from 1px Ledger Line rules. The only box-shadow is the input focus glow, which is a focus state rather than elevation.

### Named Rules
**The Ledger Not Lift Rule.** Separate things with a cream panel or a 1px line. Don't lift them with shadows.

## Shapes

Soft rectangles throughout. Panels, buttons, inputs, alerts and the payout card share one 10px radius; year cells are 8px; the band logo and skeleton bars are 6px; legend swatches are 3px; focus outlines round to 4px. The active-tab indicator is a 3px bar rounded only on its bottom corners, hanging from the bar's top edge. Borders are 1px for rules and 1.5px for interactive outlines (inputs, cells, copy button). The next-due cell is the only dashed border, at 2px.

## Components

### Buttons
Plain and solid, sized for thumbs.
- **Shape:** gently rounded (10px), minimum height 48px.
- **Primary:** navy fill, white Montserrat 700 text, 20px horizontal padding. Used for actions such as "Try again".
- **Hover / Focus:** hover shifts to Navy Pressed; focus draws a 3px navy outline 2px outside the button (cyan inside navy blocks).
- **Copy (outline):** white fill, 1.5px navy border, navy 700 text, at least 44 by 76px; hover fills Cream Pressed; the label changes to "Copied" for 1.5s.
- **Text link:** navy 700, underlined with a 3px offset, padded to a 44px tap height ("Not you?").

### Cards / Containers
- **Panel:** cream fill, 1px Ledger Line border, 10px radius, no shadow. Holds fact rows: muted label on the left, navy 700 value on the right, 12px by 16px padding, separated by 1px rules.
- **Payout card:** navy fill, 10px radius, 18px by 16px padding; white title, cyan Anton figure, Navy Subtext detail lines. One per page at most, used for the projected payout or dividend.
- **Alert:** Red Wash fill, 10px radius, red heading, Red Deep Text body. Used for missed months, over-limit amounts and loan errors.

### Inputs / Fields
- **Style:** white fill, 1.5px Ledger Line border, 10px radius, 48px high, 14px horizontal padding, with a navy 600 14px label 6px above.
- **Focus:** border turns navy and a 3px cyan glow at 35% alpha appears; the default outline is suppressed in favor of the glow.
- **Help text:** a muted 14px note directly under the field.

### Navigation
A fixed white bottom bar with a 1px top rule and four equal tabs (My Savings, Coop, Loans, Pay & Rules). Each tab stacks a 24px stroke icon over a 13px 600 label. Inactive tabs are muted; the active tab turns navy and gains a 3px cyan indicator at its top edge, and carries `aria-current="page"`.

### Icons
One stroke family on a 24px grid: 2px round-capped, round-joined strokes in currentColor, inline SVG. The check and alert marks inside year cells use heavier strokes (3px and 2.5px) at 16px.

### Year Strip (signature)
Twelve 64px cells, one per month, with the month name in 14px 700 and an optional 16px icon. Open months are white with a Ledger Line border and muted text; paid months are solid navy with a white check; missed months are solid red with a white alert mark; the next-due month has a 2px dashed navy border and navy text. A small legend below repeats the three states with 12px swatches. Each cell carries a spoken label of its state.

### Name Picker
A cream panel of full-width 56px rows, name on the left and a muted "N heads" on the right, separated by 1px rules; hover fills Cream Pressed. A search field sits above.

### Loading
Skeleton bars: 18px cream rounded bars with a cream-to-cream-pressed shimmer (1.2s, ease-out). All animation and transition is removed under reduced motion.

## Do's and Don'ts

### Do:
- **Do** keep the navy band, logo, HILAS COOP and the tracked cyan "2026" at the top of every screen.
- **Do** set every peso total a member came to see in Anton; keep all other text in Montserrat with tabular numerals.
- **Do** group related facts in a cream panel with 1px Ledger Line rules: muted label left, navy value right.
- **Do** keep touch targets at least 44px (48px for buttons and inputs, 56px for picker rows).
- **Do** use the 3px navy focus outline on light surfaces and switch it to cyan inside navy blocks.
- **Do** show month status with fill and an icon together, never color alone, and give each cell a spoken label.

### Don't:
- **Don't** add teal or any hue outside navy, cyan and red; the handbook pins the palette.
- **Don't** use red for anything except money owed, warnings and fine print.
- **Don't** use cyan as text on white; it belongs on navy or as a thin indicator.
- **Don't** add shadows to panels, cards or buttons; separate with tone and lines.
- **Don't** set headings, labels or buttons in Anton.
- **Don't** replace the year strip with a balance card plus a transaction list.

## Known Limits

- **No offline:** the app needs a network to open (no service worker in v1; offline mode is a spec non-goal). Fonts are self-hosted woff2 via @fontsource.
- **Raster provenance:** `public/logo.png`, `icon-192.png`, `icon-512.png` and `apple-touch-icon.png` were cropped from the cover of `HILAS-COOP-HANDBOOK-2026-FINAL.pdf` (page 1, the coop's own mark). They were not generated.
