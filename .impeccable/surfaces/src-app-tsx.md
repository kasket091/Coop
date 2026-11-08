---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/tabs.tsx"]
---

Scope: whole member app (src/App.tsx + src/tabs.tsx). Mode: Operate.
Audience/job: a member checks where they stand in the locked 2026 plan; secondary: loan quotes, rules, how to pay.
Constraints: brand pinned by the 2026 handbook (user instruction); read-only data from the sheet; phones first.
Unresolved: per-member loan list (needs a member column in Borrowers).

## Direction contract
THESIS: The locked year, made visible. Each member's 12 months are shown as one strip of 12 cells, paid, missed or still to come. This replaces the category default of a balance card plus a transaction list.
OWN-WORLD: The handbook's own shell: a navy #1C1B57 header band with the circle logo and a tracked cyan Anton "2 0 2 6"; a white content ground with cream #F2F0E2 panels; red #A42A24 only for missed months and fine print; Montserrat for all UI; Anton only for money figures and the year mark.
STORY: A member opens the link, taps their name once, and sees their locked plan ("12 heads · ₱6,000/month"), the year strip, what they owe if anything, their loan room and their December payout. From there they can quote a loan, read the rules, or copy the GCash number.
FIRST VIEWPORT: The navy band (logo, HILAS COOP, 2 0 2 6); the member's name; a large Anton total saved against the year target; the 12-month strip at full width; the missed-months alert if any. The bottom tab bar sits fixed: My Savings, Coop, Loans, Pay & Rules.
FORM: The handbook page (brief-pinned, position 1). seed: none (unavailable)
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
