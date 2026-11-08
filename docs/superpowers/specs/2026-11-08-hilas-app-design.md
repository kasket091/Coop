# Hilas Savings App — Design

Date: 2026-11-08 · Status: approved by default. The user asked to skip the questions and go from brainstorm to plan to build, so every choice marked **(call)** below was made by Claude and is open to change.

## Intent
HILAS Coop is a circle of friends who save together. Each member picks a number of **heads** (₱500 per head per month) at the start of the cycle and is **locked into that number from January to December**. Today all the bookkeeping lives in a Google Sheet that only Bryan, the admin, really reads.

Members want answers on their phone, quickly: *How much have I saved? What do I owe this month? How much can I borrow? What will I get in December?* The handbook rules are hard to apply by hand, and the sheet has formula bugs (see `HILAS-APP-NOTES.md`).

**Success:** a member opens the app, taps their name, and sees accurate numbers that follow the handbook. Bryan does no extra work.

## Goals
1. **My Savings:** the member's locked heads, monthly due, months paid or missed, savings to date, savings at year end, and projected dividend and payout.
2. **Coop overview:** total heads, total savings, interest collected, projected dividend per head, and the top borrower.
3. **Loan calculator:** pick a loan type, amount and term. The app shows the interest, the monthly schedule and the total payable, plus the member's loan limit (heads × ₱8,000) and the yearly minimum loan.
4. **Rules & Pay:** the handbook rules in short form, payment channels (BPI, GCash, Maya, cash), and the deadlines.
5. Hilas branding taken from the handbook, built mobile-first, and installable on a home screen.

## Non-goals (v1)
- Recording payments or loans in the app. Bryan keeps editing the sheet. **(call)** This avoids accounts, a database and two sources of truth.
- Showing each member's individual loans. The Borrowers sheet records borrowers by nickname ("Mark (50,000)"), which doesn't map reliably to a member. That needs a member column in the sheet first.
- Logins. The sheet is already public by link, so the app exposes nothing new. A member picks their name and the app remembers it on that phone.
- Push notifications and offline mode.

## Anti-goals
- Numbers that disagree with the handbook. The app must compute from the rules, not copy the sheet's buggy formula totals.
- A slow or cluttered experience on a cheap Android phone.

## Constraints
- Data comes from the public Google Sheet through the gviz CSV endpoint (CORS is allowed, verified 2026-11-08):
  - `Members Monthly Savings!A1:R35`: ID, name, heads, monthly amount, share, Jan–Dec, total
  - `InterestPaid!A1:N35`: ID, name, Jan–Dec interest
- Values arrive as strings with thousands separators ("6,000").
- Payout is December 16–19. Contributions are due on the 1st–7th of each month.

## Rules the app computes (from the handbook)
- `monthlyDue = heads × 500`. The year-end savings target is `heads × 500 × 12`.
- **Missed month:** a past month (or the current month after the 7th) with no payment. Under the rule it becomes a borrowed amount at 10% per month, compounding: `amount × 1.1^months`.
- **Loan limit:** `heads × 500 × 12 + heads × 2000` = `heads × 8000`.
- **Minimum loan per year:** 1–4 heads ₱10k, 5–7 heads ₱20k, 8–12 or more heads ₱30k.
- **Dividend per head:** `(Σ interest − topBorrowerRebate) / Σ heads`, where the rebate is 3% of the highest member's interest.
- **Member payout:** `savings + heads × dividendPerHead`, plus the rebate if the member is the top borrower.
- **Loans:**
  - Regular (flat): 2 months at 6%, 3 months at 5.5%, 6 months at 5%. Interest is `capital × rate × months`, paid in equal installments. Allowed amounts are ₱10k–50k for 2 or 3 months and ₱20k–75k for 6 months. Under ₱10k becomes a Flex loan.
  - Flex: 7% if paid within 15 days, otherwise 8% per month, compounding while unpaid.
  - Grocery: 5% per month, minimum ₱2,000.
  - Appliance: 5% per month, minimum 2 months.
  - Special Events: 8% per month, board members only.
- The current month is taken from the device date, capped to the 2026 cycle. **(call)**

## How it's built (calls)
- **Stack:** Vite, React and TypeScript, as a single-page PWA (web manifest and icons, no service worker yet). Vitest tests the rules engine. It needs no server and deploys as static files (for example GitHub Pages or Vercel).
- **Structure:**
  - `src/rules.ts`: pure functions for all the maths above, fully unit-tested
  - `src/data.ts`: fetches the sheet and parses the CSV into typed members
  - `src/App.tsx`: bottom tabs (My Savings, Coop, Calculator, Rules & Pay)
  - one CSS file with brand tokens
- **Brand:** navy `#1C1B57` as the primary, red `#A42A24` for warnings, cream `#F2F0E2` for surfaces, and cyan `#09C3E4` / teal `#03989E` as accents. Montserrat for body text and Anton for numbers and headers. The logo comes from the handbook PDF.
- **Member choice:** a searchable list of names, with the choice saved in `localStorage`.

## Left to the builder
Exact layout and spacing, empty and error states (show a clear message and a retry when the sheet can't be reached), and the money format (`₱12,345.67`).
