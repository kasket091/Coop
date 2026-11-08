# Product

<!-- impeccable:product-schema 1 -->

> Inferred from the user's brief, the 2026 handbook and the coop spreadsheet. The user asked to proceed without the interview, so lines marked *(inferred)* are unconfirmed.

## Platform

web

## Stack

delegated: Vite + React + TypeScript static PWA, no backend. The data is read live from the coop's public Google Sheet. Chosen because it needs no accounts or servers and installs from a link.

## Users

Members of HILAS Coop, a savings cooperative of friends and family in Cagayan de Oro, Philippines: 33 active members holding 304 heads in 2026. They check on their phone, usually from a Messenger link, to see where they stand *(inferred)*. Bryan Kevin Tabuan is the volunteer admin who keeps the sheet.

## Product Purpose

Each member's savings plan is locked: the number of heads (₱500 per head per month) they chose in January stays fixed until December. The app shows a member, in seconds, their locked plan, what they have paid, any missed months and what those now cost, how much they can borrow, and their projected December payout. Every number follows the handbook. Success means members stop asking Bryan "magkano na akong savings?" *(inferred)*.

## Positioning

The coop's own handbook rules, computed exactly: loan limit = heads × ₱8,000, dividend = (interest − top-borrower rebate) ÷ heads, missed contributions at 10% per month. A generic budgeting app can't do this.

## Operating Context

- **Cycle:** January to December 2026. Contributions are due on the 1st–7th of each month. Loans are repaid by December 15, and payout is December 16–19.
- **Payments:** BPI, GCash, Maya or cash, all to Bryan.
- **Data:** the Google Sheet tabs "Members Monthly Savings" and "InterestPaid".

## Capabilities and Constraints

- Read-only in v1. Bryan still records everything in the sheet.
- No logins: a member picks their name. The sheet is already public by link.
- Individual loans aren't shown, because the Borrowers tab uses nicknames.
- Loan types: Regular (2 months at 6%, 3 months at 5.5%, 6 months at 5%), Flex (7% within 15 days, otherwise 8%), Grocery 5%, Appliance 5%, and Special Events 8% (board members only).

## Brand Commitments

The user made the handbook's brand binding:
- navy `#1C1B57` page bands
- cyan "2026" mark
- red `#A42A24` for warnings and fine print
- cream `#F2F0E2`
- Montserrat for body text, Anton for the tracked "2 0 2 6"
- the multicolor circle-of-people logo
- the tagline "Save Together, Help Each Other, Share the Rewards."

## Evidence on Hand

- `HILAS-COOP-HANDBOOK-2026-FINAL.pdf` (the rules)
- the live Google Sheet (real member data)

There are no testimonials or endorsements, and none should be invented.

## Product Principles

1. The handbook is the law: compute from the rules, never from hand-typed totals.
2. One tap to "where do I stand".
3. Money is shown exactly, in ₱ with centavos where they exist.
4. It works on a cheap Android phone over mobile data.

## Accessibility & Inclusion

The audience includes older relatives *(inferred)*: text must be large and high-contrast, touch targets at least 44px, and plain English with familiar Filipino money terms.
