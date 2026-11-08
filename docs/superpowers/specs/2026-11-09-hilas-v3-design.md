# Hilas Coop v3: Recruiter co-makers, Loan Against Deposit, transaction history, loan views, quarterly dashboard

Date: 2026-11-09 · Status: draft for approval · Builds on v2 (`2026-11-08-hilas-v2-firebase-design.md`), live at https://hilas-coop.web.app

## Intent
The coop is moving from the spreadsheet to the app for real. Members need to see their own loans and every peso they have paid. Loans should follow how the coop actually works: each member's recruiter vouches for them. Money records must become an audit trail (a list of transactions), not editable boxes. For the quarterly meeting, the admin needs the same two grids the coop has always looked at (savings and interest, by member and month) inside the app.

## Decided by the user
### Members
1. **Calculator:** the "Pay the interest every month" line shows only the monthly interest. For ₱20,000 Flex it shows ₱1,600, not ₱21,600.
2. **Loans tab:** shows Loan history, Active and Closed loans, Current remaining total, and Payment transactions.
3. **Loan type labels:** "Regular (flat rate)" becomes "Regular".
4. **New loan type, Loan Against Deposit:**
   - Amount = 80% of the member's total savings. It is filled in automatically and can't be edited.
   - No co-maker.
   - Interest: 7% a month.
   - Allowed only when the member has **no unpaid loans and no pending request**.
5. **Co-maker:** exactly 1 co-maker, the member's recruiter. The drop-down shows only that one founding member. Recruiters:
   - **Bryan Kevin Tabuan:** Leobardo Tabuan, Isabel Tabuan
   - **Mary Joy Tabuan:** Kyle Kent Tabuan, April Rose Salo
   - **Mark Anthony Ampo:** Rosly Ampo, Evangeline Ampo
   - **Dawn Hope Tejano:** Susan Cabangisan, Ren Mark Cabangisan, Sarah Jean Cabangisan
   - **Jeram Rey Tejano:** Era Tejano-Estremos, Aida Tejano
   - **Maricris Jose:** Alexander Arcayena, Mary Nicole Arcayena
   - **Peter John Jose:** none this year
   - **Chariz Parajes:** Nico Sabio, Aljem Aviola
   - **Israil Parajes:** Ingrid Suson, Paul John Suson
   - **Mark Dave Tumanda:** Mary Henzel Tumanda
   - **Joyma Tumanda:** Felipe Rebosura, Marifel Atkinson, Marc Rebosura, Chai Rebosura
6. **Founding members within their loan limit:** no co-maker; the request goes straight to the admin.
7. **Founding members over their loan limit:** need **2 founding-member co-makers**.

### Admin
8. **Loans tab:** a new tab with **Active Loans** and **Closed Loans**.
9. **Recruits:** each founding member's page shows the members they recruited.
10. **Transaction history replaces the editable month grid.** It records Savings and Loan/Interest transactions. A mistake is **voided with a reason**: it stays visible, crossed out, and totals ignore it.
11. **"Board members only" toggle** on the Members list.
12. **Dashboard** for the quarterly meeting, modelled on the two sheet screenshots:
    - **Savings grid:** members × Jan–Dec, with monthly totals and the grand total.
    - **Interest grid:** members × Jan–Dec, with totals and the 3% top-borrower column.

## Calls made by Claude (open to change)
- **Bryan is a board member** in the app (`founder: true`), because he recruits and co-makes for Leobardo and Isabel.
  - Following the handbook ("the Admin (Bryan) is not permitted to serve as a co-maker … for any loan limit extension"), Bryan is **excluded** from the 2-founder over-limit picks.
  - "Board members only" shows the 11 active board members, Bryan included.
- **A non-founder can't request more than their limit.** The rule stays; only founders can go over their limit, with 2 co-makers.
- **Loan Against Deposit amount:** 80% of savings paid so far, rounded down to the nearest ₱100. It behaves like a monthly-rate loan: Pay interest, Carryover and Custom Payment all work. Months: 1 up to the months left before December 15.
- **"Unpaid loans" = approved app loans with a balance, plus the old-sheet balance.** A member with an old-sheet balance above ₱0 can't take a Loan Against Deposit.
- **Transactions are the source of truth.** Each member's 12 monthly savings and interest numbers become a summary worked out from their transactions. The admin rewrites it with every transaction, so the coop totals and dividend keep working unchanged.
- **Transaction kinds:**
  - `savings`: a monthly contribution
  - `interest`: interest collected, whether recorded by hand or by Pay interest, Custom Payment or settling a loan
  - `principal`: loan money repaid
  - `release`: a loan handed out, recorded when it is approved, for the loan history
  - Each transaction carries: member, amount, ledger month, cycle, optional loan, note, created date, and voided info (date and reason).
- **Switching to transactions (one-time "Re-sync from the sheet" button):**
  - It turns the **current** sheet numbers into opening transactions, one per member per month with money, noted "From the 2026 sheet".
  - It catches up the ₱8,213 of interest added to the sheet since the 8 Nov import. The sheet now shows ₱254,645.93.
  - Interest recorded in the app since the import is replaced by the sheet's numbers. Only test entries exist.
  - After the switch the sheet is no longer read.
- **Member Loans tab order:** Current remaining total (big number), Active loans (balance, this month's interest, payments), My requests (pending), Closed loans, Payment transactions (all of theirs, newest first), then Request a loan and the Calculator.
- **Admin tabs (at most 5):** Members · Loans · Requests · Dashboard · Coop.
- **Dashboard layout:**
  - Above the grids: totals by quarter (Q1–Q4 savings and interest), then the dividend per head and the top borrower.
  - Grids scroll sideways on a phone and fit on a laptop for the meeting.
  - A **Print** button gives a clean printout.

## Data changes (Firestore)
- **`members/{uid}`:** add `recruiterId?: string`; `founder` now means a board member (Bryan included).
- **New `transactions/{id}`:** `memberId`, `memberName`, `kind`, `amount`, `month` (0–11), `cycle`, `loanId?`, `note`, `createdAt`, `voidedAt?`, `voidReason?`.
- **`loanRequests`:**
  - `type` adds `deposit`
  - `comakerIds` may have 0, 1 or 2 entries
  - new `overLimit: boolean`
- **Rules:**
  - **Transactions:**
    - **Read:** the admin, or the member reading their own (`memberId == uid`).
    - **Write:** the admin only.
  - **Creating a loan request:** allowed only in one of three shapes:
    - **0 co-makers:** the borrower is a founder, or the type is `deposit`.
    - **1 co-maker:** it must be the borrower's `recruiterId`.
    - **2 co-makers:** both founders, neither is the borrower, and neither is Bryan.
  - The 80% amount, the limit checks, "no unpaid loans" and "one pending request" are enforced by the app's screens, as in v2.

## Non-goals
Payments made by members in the app (GCash integration), push notifications, editing a transaction (void and re-enter instead), and multi-year reports.

## Left to the builder
- Visual details inside DESIGN.md.
- Chart styling, if any charts are added beside the grids.
- Empty states.
