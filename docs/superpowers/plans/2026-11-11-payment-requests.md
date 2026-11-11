# Payment Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members send loan and savings payments with a screenshot from the app; the admin approves or rejects them in a new Payment Request tab, and approval records them with the existing money logic.

**Architecture:** A pure module (`src/payments.ts`) holds the request type and every rule (amounts per choice, unpaid months, savings window, what approval will record). `store.ts` reads/writes `paymentRequests` and `paymentProofs` and approves through the existing `loanCustomPayment` / `addTransaction`, with the request's status written in the same Firestore transaction. UI: one pop-up file for members, one panel in the admin Loans screen, one new push trigger.

**Tech Stack:** Vite 5, React 18, TypeScript, Vitest, Firebase Auth/Firestore/Functions (v2, Node 22), existing push (`functions/src/index.ts` `send`).

**Spec:** `docs/superpowers/specs/2026-11-11-payment-requests-design.md`

## Global Constraints

- Nothing changes a balance before the admin approves (requests are separate documents).
- Approval uses only existing record functions: `loanCustomPayment(id, year, amount, at, forAt?)` for loans, `addTransaction(m, amount, month, note, year)` for savings; `at` = the request's `createdAt`.
- Full payment amount = `balanceOf(loan)`; Interest amount = `interestDueNow(loan, txns, now)` (hidden when 0 and for Savings Loans).
- Pay savings: open from the 1st to the 7th (Manila, `DUE_DAY` = 7), current month only, default `monthlyDue(heads)` (₱500 × heads), hidden when that month is fully paid or the account is terminated.
- Screenshot: JPEG ≤ 1000 px on the long side, stored as a data URL in `paymentProofs/{requestId}`; not in backups.
- Payment accounts: the BPI, GCash, Maya rows of Pay & Rules (`CHANNELS` in `src/tabs.tsx`), no Cash row, with Copy.
- New cycle and Clear database delete all `paymentRequests` and `paymentProofs`; `paymentRequests` is in `BACKUP_COLLECTIONS`, `paymentProofs` is not.
- Copy: tab "Payment Request"; buttons "Pay Now", "Pay savings", "Send", "Approve", "Reject"; closed-window note "Savings for {Month} closed on the 7th. Message the admin."
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; work on branch `feat/payment-requests`.

## Review Focus

1. A request approved after the loan changed (paid off, voided, more than now owed) → the card says why, only Reject works, nothing is recorded. (Task 2 test: `approvalPreview` returns an error.)
2. Double tap on Approve, or two admin phones → recorded once (status checked inside the transaction). (Task 3: `approvePaymentRequest` throws "already decided" when status ≠ pending; verified in the browser step.)
3. A member opening Pay savings on the 8th, or for a fully paid month → disabled with the closed-window note / hidden. (Task 1 tests on `savingsPayOpen`.)
4. A huge phone photo (10+ MB HEIC/JPEG) → shrunk below 1 MB before saving, or a clear "use a screenshot" error. (Task 4: `shrinkImage` caps size; manual check in browser.)
5. A member sends Custom with no ticks and an amount below that month's interest → preview shows the shortfall carried into the balance, exactly as the admin's form. (Task 1 test via `choicePreview`.)

---

### Task 1: Payment rules (pure)

**Files:**
- Create: `src/payments.ts`, `src/payments.test.ts`

**Interfaces:**
- Consumes: `balanceOf, interestDueNow, customPayment, waivedDue, loanPeriod, periodAt, principalOf, type LoanRequest` (requests.ts); `type Txn` (ledger.ts); `monthlyDue, DUE_DAY` (rules.ts).
- Produces:
  - `type PayChoice = 'interest' | 'full' | 'custom'`
  - `type PaymentRequest = { id: string; memberId: string; memberName: string; kind: 'loan' | 'savings'; loanId?: string; loanLabel?: string; choice?: PayChoice; months?: string[]; month?: number; amount: number; createdAt: number; status: 'pending' | 'approved' | 'rejected'; decidedAt?: number; reason?: string }`
  - `unpaidInterestMonths(r: LoanRequest, txns: Txn[]): { period: number; dueAt: number; amount: number }[]` (oldest first)
  - `choiceAmount(r: LoanRequest, txns: Txn[], choice: Exclude<PayChoice, 'custom'>, now: number): number`
  - `choicePreview(r: LoanRequest, txns: Txn[], amount: number, now: number): ReturnType<typeof customPayment>` (uses `waivedDue(amount, interestDueNow(...))`)
  - `savingsPayOpen(now: Date, year: number): boolean` and `savingsPayMonth(now: Date): number` (Manila month)

- [ ] **Step 1: Write the failing tests** in `src/payments.test.ts`:
  - `unpaidInterestMonths`: flex ₱48,000 with carryover notes ₱3,840 (period 1), ₱4,147.20 (period 2), balance ₱55,987.20, principal ₱48,000 → both months; same loan with principal ₱48,000 and balance ₱52,000 (₱3,987.20 of the carried interest paid) → one entry, period 2, amount ₱4,000 (a partly paid month shows what's left); no carried interest → `[]`; voided carryovers ignored.
  - `choiceAmount(full)` = `balanceOf`; `choiceAmount(interest)` = `interestDueNow`; Savings Loan interest = 0.
  - `choicePreview` for ₱24,825.44 on balance ₱55,987.20 inside the May period → balance ₱31,161.76; for ₱1,000 → shortfall carried (balance ₱59,466.18 with month interest ₱4,478.98).
  - `savingsPayOpen`: Nov 7 23:00 Manila → true; Nov 8 00:30 Manila → false; a date outside `year` → false.
- [ ] **Step 2: Run** `npx vitest run src/payments.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/payments.ts`. Unpaid months: carried = `balanceOf − principalOf`; walk live carryover txns for this loan newest first (amount from the note's first ₱ figure, as `account-log.ts` `firstPeso` does — export it from there rather than copy), taking each until the carried total is used up; the last one taken may be partial; return oldest first. Manila dates: `new Date(ms + 8h)` with UTC getters, as elsewhere.
- [ ] **Step 4: Run** `npx vitest run` → all pass.
- [ ] **Step 5: Commit** `feat: payment request rules`.

### Task 2: Approval preview (pure)

**Files:**
- Modify: `src/payments.ts`, `src/payments.test.ts`

**Interfaces:**
- Consumes: Task 1; `recordedLate, paymentHistory, replayLoan, loanPeriod` (requests.ts).
- Produces: `approvalPreview(p: PaymentRequest, loan: LoanRequest | undefined, txns: Txn[]): { savings: true } | { balance: number } | { error: string }`

- [ ] **Step 1: Tests:** loan request whose loan is `paid` → `{ error: 'This loan is already paid off.' }`; loan missing → `'This loan no longer exists.'`; amount more than owed on its day → error from `customPayment`; normal custom → `{ balance }` equal to `choicePreview` at `p.createdAt`; recorded late (a carryover for its period exists) → `{ balance }` from `replayLoan`; savings → `{ savings: true }`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (mirror `CustomPay`'s late/normal branch in `AdminApp.tsx`). **Step 4: Run** → pass. **Step 5: Commit** `feat: approval preview for payment requests`.

### Task 3: Store, rules, backup, cycle clearing

**Files:**
- Modify: `src/store.ts`, `firestore.rules`, `src/backup.ts`, `src/backup.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `loanAction` (extend: optional third return field `also?: (tx: Transaction) => void` run inside the same transaction); `loanCustomPayment` (add last param `via?: string`, appended to each entry's note as `" · {via}"`).
- Produces:
  - `sendPaymentRequest(p: Omit<PaymentRequest, 'id' | 'status' | 'createdAt'>, proof: string): Promise<void>` (writes request + proof in one batch, `status: 'pending'`, `createdAt: Date.now()`)
  - `withdrawPaymentRequest(id: string): Promise<void>` (deletes request + proof; pending only)
  - `watchMyPaymentRequests(uid, cb)`, `watchPaymentRequests(cb)` (admin, newest first)
  - `getPaymentProof(id: string): Promise<string | undefined>`
  - `approvePaymentRequest(p: PaymentRequest, m: StoredMember, year: number): Promise<void>` — loan: `loanCustomPayment(p.loanId, year, p.amount, p.createdAt, undefined, via)` with the request marked `approved` inside the same transaction (and throws `'This request was already decided.'` if it isn't pending); savings: one transaction that writes the savings txn (same record as `addTransaction`, note `via`) and the status, then `rebuildLedger`.
  - `rejectPaymentRequest(id: string, reason: string): Promise<void>` (reason required)
  - `via` text: `"Member's payment request"` plus `"; months: Jul 6, Aug 6"` when `months` is set.
- [ ] **Step 1:** Update `backup.test.ts` to expect `'paymentRequests'` at the end of `BACKUP_COLLECTIONS`; run → FAIL; add it to `backup.ts`; run → pass.
- [ ] **Step 2:** `firestore.rules`: `paymentRequests/{id}` — read: admin, or member and `resource.data.memberId == me()`; create: member, `next().memberId == me()`, `next().status == 'pending'`, `next().amount > 0`; delete: admin, or own while `resource.data.status == 'pending'`; update: admin only. `paymentProofs/{id}` — create: member when the matching request (same id) is theirs (`getAfter`), `next().data` is a string under 900,000 chars; read: admin or own; delete: admin or own. Deploy target `firestore:rules` (later task).
- [ ] **Step 3:** `startCycle`: add `'paymentRequests', 'paymentProofs'` to its list. `clearDatabase`: after the backup collections, also clear `paymentProofs`.
- [ ] **Step 4:** Implement the store functions above. `npx tsc --noEmit -p .` and `npx vitest run` → pass.
- [ ] **Step 5: Commit** `feat: payment requests storage, approval and rules`.

### Task 4: Member pop-ups

**Files:**
- Create: `src/pay-dialogs.tsx`, `src/image.ts`
- Modify: `src/tabs.tsx` (export `PaymentAccounts` built from `CHANNELS` without Cash; `PayRules` uses it), `src/member-tabs.tsx` (per-loan Pay Now opens `PayLoanDialog`; the Pay Now under the total still calls `onPay`), `src/MemberApp.tsx` (`MySavings` `extra={<PaySavingsButton …/>}`), `src/styles.css`

**Interfaces:**
- Consumes: Tasks 1, 3.
- Produces: `shrinkImage(file: File, max = 1000): Promise<string>` (canvas → `image/jpeg` quality 0.7; throws `"That image couldn't be read. Send a screenshot instead."`); `PayLoanDialog({ me, loan, loans, txns, onClose })`; `PaySavingsButton({ me, year })`.

- [ ] **Step 1:** Per-loan Pay Now hidden for terminated members. Loan pop-up (native `<dialog>` like `LogButton` in `AdminApp.tsx`): title = loan label; choice radio Interest / Full payment / Custom Payment (Interest hidden when 0 or Savings Loan); Custom shows `unpaidInterestMonths` as checkboxes (label `Jul 6 · ₱853.66`) — ticking sets the amount to the ticked sum, typing overrides; preview line from `choicePreview`; "Your loans" list (ref · type, owed, interest due) for all active loans; file input `accept="image/*"` with a thumbnail; `PaymentAccounts`; **Send** disabled until amount > 0, a screenshot and no preview error. On send: `sendPaymentRequest`; close with `tell('Sent. The admin will check it and record it.')`.
- [ ] **Step 2:** Pay savings button above the total (via `extra`): hidden when terminated or `m.paid[month] >= monthlyDue(heads)`; disabled with the closed-window note when `!savingsPayOpen`; pop-up = month name, amount (default monthly due, editable), screenshot, `PaymentAccounts`, Send.
- [ ] **Step 3:** Member's own pending requests: under "Waiting for approval" on the Loans tab, list pending payment requests (what, amount, date) with **Withdraw**; rejected ones in the last 30 days show their reason.
- [ ] **Step 4:** `npx tsc --noEmit -p .`, `npx vitest run`, `npm run build` → pass. Browser check in the preview (signed in as a member): open both pop-ups, attach a screenshot, see the preview and Copy buttons; Pay savings disabled after the 7th.
- [ ] **Step 5: Commit** `feat: member Pay Now and Pay savings pop-ups`.

### Task 5: Admin Payment Request tab and account log

**Files:**
- Modify: `src/AdminApp.tsx` (LoansAdmin tab `'payments'` between Active and Closed, count = pending; `PaymentRequestsPanel`), `src/account-log.ts` + test (`accountLog(loans, txns, payments: PaymentRequest[] = [])`), `src/styles.css`

**Interfaces:**
- Consumes: Tasks 1–3; `accountLog` (add 3rd param).
- Produces: rejected requests as log lines `{ at: decidedAt, label: 'Payment request rejected: {reason}', amount }` in the loan's group (by `loanId`) or Savings; pending/approved requests add no lines.

- [ ] **Step 1:** Log test: a rejected loan request appears under its month in the loan's group; a pending one doesn't. Run → FAIL; implement; run → pass.
- [ ] **Step 2:** Panel: name search applies; pending first (newest first), then decided. Card: name, what (loan label + choice + months, or "{Month} savings"), amount, sent date, "another request for this loan is waiting" when applicable, screenshot loaded on demand with `getPaymentProof` (tap to open full size in a `<dialog>`), preview line from `approvalPreview` ("Approving records ₱X; new balance ₱Y" / the error), **Approve** (disabled on error; `askYes` first) and **Reject** (`askText` for the reason). Admin watches requests with `watchPaymentRequests` in `AdminApp` and passes them to `LoansAdmin` and the `LogButton`.
- [ ] **Step 3:** `tsc`, `vitest`, `build` → pass. **Step 4: Commit** `feat: admin Payment Request tab`.

### Task 6: Push notifications

**Files:**
- Modify: `functions/src/messages.ts` + `functions/src/messages.test.ts`, `functions/src/index.ts`

**Interfaces:**
- Produces: `paymentMessagesFor(before: PayReq | undefined, after: PayReq): Message[]`; trigger `paymentRequestPush = onDocumentWritten('paymentRequests/{id}', …)` using `send`.

- [ ] **Step 1: Tests:** new pending → `{ to: 'admin', title: 'Payment to check', body: 'Ana sent ₱500 for 3FL interest.' }` (savings: "for November savings"; full: "to pay off 3FL"; custom: "for 3FL"); pending→approved → member `'Payment recorded'`, `'Your ₱500 payment for 3FL was recorded.'`; pending→rejected → `'Payment not accepted'`, `"Your ₱500 payment for 3FL wasn't accepted: {reason}."`; other changes → `[]`.
- [ ] **Step 2:** Run → FAIL; implement; run `cd functions && npm test` (or the repo's vitest including functions) → pass; `npm run build` in functions → pass.
- [ ] **Step 3: Commit** `feat: payment request notifications`.

### Task 7: Verify and hand off for deploy

- [ ] **Step 1:** Full `npx vitest run`, `npx tsc --noEmit -p .`, `npm run build`, functions build → all pass.
- [ ] **Step 2:** Browser check as a member (send both kinds, withdraw one). Admin screens can't be signed into from here: report that as unverified.
- [ ] **Step 3:** Ask Dave to deploy (hosting, firestore:rules, functions). Do not deploy before he says so.
