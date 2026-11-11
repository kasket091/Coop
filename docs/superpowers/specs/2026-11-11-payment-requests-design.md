# Payment requests: members send payments in the app

Date: 2026-11-11 · Status: draft for Dave's approval

## Why

Today a member messages the admin on Facebook Messenger ("I'm paying my loan / savings / interest"), pays by GCash,
Maya or BPI, and sends a screenshot. The admin checks GCash or the bank, then records it. This moves that into the
app: the member sends the payment with its screenshot from the screen where they see what they owe, and the admin
approves it from one list. Approving records it with the same logic the admin's buttons use today, so interest,
carryovers, the account log and the Dashboard stay connected.

## Goals

- **Pay Now** on each loan entry (member Loans tab) opens a payment pop-up for that loan.
- **Pay savings** above the savings total (member Savings tab) opens a savings payment pop-up.
- Each pop-up takes a screenshot and shows the BPI, GCash and Maya rows (with Copy) from Pay & Rules.
- A new admin Loans tab, **Payment Request**, right after Active Loans, lists them; the admin approves or rejects.
- Push notifications: the admin on a new request; the member when it's approved or rejected.
- The account log (clock icon) shows approved payments as now, plus rejected requests.

## Non-goals

- No automatic checking of GCash or bank: the admin confirms the money arrived before approving.
- No paying ahead for later months through Pay savings (the admin's Record savings still does that).
- The **Pay Now** under the loans total keeps going to Pay & Rules (only the per-loan buttons change).

## Anti-goals (a failure even if it works)

- A request changing any balance before the admin approves it.
- Approval computing money differently from the admin's own buttons (two sources of truth).
- Interest charged for the days the admin took to approve.

## Member: Pay Now on a loan

Pop-up title: the loan, e.g. "3FL · Flex loan". It shows what is owed and the interest due now. The member picks:

1. **Interest**: the interest due now on that loan (requests.ts `interestDueNow`). Hidden when it is ₱0 (already
   paid or carried over) and for Savings Loans (their 10% goes straight into what is owed).
2. **Full payment**: everything still owed (`balanceOf`), which closes the loan when approved.
3. **Custom Payment**: any amount. Tick boxes list the loan's months of **missed interest still unpaid** (its
   carryover lines, oldest first, each with its date and amount). Which months are still unpaid: payments clear the
   oldest first, so they are the newest carryover lines that together make up the carried interest still in the
   balance (balance − principal); a partly paid month shows what is left of it. **Builder's call (Claude).** Ticking fills a suggested amount (the sum of the
   ticked months); the member can still type any amount. Agreed rule: money always clears the oldest unpaid carried
   interest first, then the loan, so the ticks help choose the amount and tell the admin what was meant; they don't
   pick which interest is paid.

Under the choice: a live preview (interest / carried interest / off the loan / new balance), the same split
`customPayment` + `waivedDue` gives today. Below it: a short explainer of all the member's loans (ID, owed, interest
due), then the screenshot field, then the three payment accounts with Copy. **Send** is enabled once there is an
amount above ₱0 and a screenshot.

## Member: Pay savings

Button above the savings total on the Savings tab. Enabled from the 1st to the 7th of the month (Manila time); from
the 8th it is greyed out with "Savings for {month} closed on the 7th. Message the admin." It is for the current month
only, with the usual amount for the member's heads (heads × ₱500 per month, as the app already computes it) filled in
and editable. Hidden when that month is already fully paid or the account is terminated. Same screenshot field and
payment accounts.

## Admin: Payment Request tab

Loans screen tabs: Advance Payment · Active Loans · **Payment Request** · Closed Loans (count above each title, as
now; the tab's count is pending requests). The name search filters it too. Pending first, newest first; decided ones
below. Each card: member name, what it's for (loan ID and type + Interest / Full payment / Custom with ticked months,
or "{Month} savings"), amount, date sent, the screenshot (tap to see it large), and **Approve** / **Reject** (Reject
asks for a reason, shown to the member). Before approving, the card previews what approval will record, using the
same functions as the record actions; if that would fail (e.g. the loan was paid off meanwhile, or the amount is now
more than owed), it says so and only Reject is possible.

### What Approve records (no new money logic)

| Request | Recorded with | Date used |
|---|---|---|
| Loan, Interest | `loanCustomPayment(loan, amount, at)`: an amount equal to the month's interest pays it first, exactly what Pay interest records | the day the request was sent |
| Loan, Full payment | `loanCustomPayment` with the full balance: pays the loan off and closes it (Savings Loans' savings settle as with Mark as paid) | the day sent |
| Loan, Custom | `loanCustomPayment(loan, amount, at)`: same rules as the admin's Advance/Custom Payment, including late-entry rebuilds | the day sent |
| Savings | `addTransaction(member, amount, month)` | month = the request's month |

The entries' notes say they came from the member's request (and the ticked months for Custom), so the account log
and transaction list show it. Approve and the request's status change happen in one database transaction (the
loan/savings write and the request update together), so a request can't be recorded twice. **Builder's call
(Claude):** extend the existing `loanAction` helper to take the request update along, rather than a second write.
Why Full payment is just the balance: under the agreed rule, a payment bigger than the month's interest skips that
month's interest, so paying everything owed inside the month costs the balance.

## Account log

Approved payments appear through their transactions, as now. Rejected requests appear as a line under their month
(the loan's group, or Savings): "Payment request ₱X rejected: {reason}". Pending requests are not in the log.

## Notifications (existing push setup)

- New request → admin: "Payment to check: {name} sent ₱X for 3FL interest."
- Approved → member: "Your ₱X payment for 3FL was recorded." Rejected → member: "Your ₱X payment wasn't accepted: {reason}."

## Data

- `paymentRequests/{id}`: memberId, memberName, kind ('loan' | 'savings'), loanId?, loanLabel?, choice
  ('interest' | 'full' | 'custom')?, months? (ticked periods, for display), month? (savings), amount, createdAt,
  status ('pending' | 'approved' | 'rejected'), decidedAt?, reason?.
- `paymentProofs/{requestId}`: the screenshot, a JPEG shrunk on the phone to about 1,000 px wide (around 100–200 KB),
  kept in its own document so the request list loads without images. **Builder's call (Claude):** Firestore instead of
  Firebase Storage, because Storage was never set up on this project (the handbook upload hit a missing bucket) and
  this needs no console step. About 80 members × a few payments a month ≈ 0.3 GB a year, inside Firestore's 1 GB free
  storage for about 3 years; screenshots older than a cycle can be deleted later if needed.
- Rules: a member can create requests and proofs for themselves only (memberId = their uid, status 'pending'), read
  their own, and withdraw (delete) their own while pending; only the admin can approve/reject or read everyone's.
- **Deleted with the cycle (Dave):** starting a new cycle and **Clear database** both delete every payment request
  and every screenshot, the same way they delete members, loans and transactions.
- Backups: `paymentRequests` goes in the backup file; screenshots (`paymentProofs`) don't, so backup files stay small.
  **Builder's call (Claude):** a restore brings back the requests without their screenshots (the money is already in
  the transactions); Clear database deletes the screenshots separately since they aren't in the backup list.

## Edge cases

- Several pending requests for one loan: allowed; each card warns "another request for this loan is waiting".
  Either order works: approving an older one after a newer one rebuilds the loan from its payments in date order
  (the existing late-entry rule).
- Loan changed after sending (paid off, voided, amount now too high): the card says why and offers only Reject.
- A member withdraws a pending request: it disappears from the admin list; nothing is recorded.
- Terminated members: Pay Now and Pay savings are hidden.
- Offline: sending fails with the app's usual offline message.

## Left to the builder

Tests for every pure part (unpaid months list, the amount each choice fills in, what approval records, push
messages, the log's rejected lines), as the rest of the app has. Exact wording and layout within the app's existing styles; the image-shrinking code; where the shared payment-accounts
rows live (taken out of Pay & Rules into one component used by all three places).
