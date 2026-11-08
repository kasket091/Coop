# Hilas v2 (Firebase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members log in with Name + Password and see only their own savings. They can request loans with 2 founding co-makers. Founders approve requests from an Alerts tab. An admin manages members, payments and interest, approves loans and starts new cycles. All data lives in Firebase.

**Architecture:**
- Pure, unit-tested modules hold every rule:
  - `rules.ts`: handbook money, plus the cycle year and months remaining.
  - `accounts.ts`: name normalisation, login keys, starting passwords.
  - `requests.ts`: loan-request validation and status.
- `store.ts` is the only file that talks to Firebase.
- Firestore security rules enforce privacy and who may write what.
- The UI splits into `Login`, `MemberApp` (5 tabs) and `AdminApp` (3 tabs). It reuses v1 components and DESIGN.md.

**Tech Stack:** Vite 5, React 18, TypeScript, Vitest, `firebase` web SDK (Auth + Firestore), Firebase CLI via `npx firebase-tools`.

**Spec:** `docs/superpowers/specs/2026-11-08-hilas-v2-firebase-design.md` (v1 spec and DESIGN.md still apply)

## Global Constraints
- **Admin sign-in email:** `admin@hilas-coop.app`. The user creates this account in the Firebase console with their chosen password; it never appears in the repo.
- **Member sign-in email:** `m-<20 random [a-z0-9]>@members.hilas-coop.app`.
- **Login lookup:** `logins/{sha256hex(normalizeName(name))}` → `{ email, memberId }`.
- **Starting password:** the member's name with all whitespace removed, case kept.
- **Founding co-makers (10):** Mark Anthony Ampo, Jeram Rey Tejano, Peter John Jose, Israil Parajes, Mark Dave Tumanda, Dawn Hope Tejano, Maricris Jose, Mary Joy Tabuan, Chariz Parajes, Joyma Tumanda.
- **Cycle year:** read from `settings/cycle.year`; the default is 2026. Loans must end on or before Dec 15 of the cycle year.
- **Firestore location:** `asia-southeast1`.
- **Design:** DESIGN.md is the visual authority (navy band, cream panels, Anton money, 5-tab max bottom bar).

## Review Focus
1. **A member reading another member's doc, or listing `logins`:** the rules must deny it (Task 2, rules review). The emulator can't run without Java, so this is reviewed by hand.
2. **A co-maker editing anything besides their own approval:** the rules must deny it.
3. **Months remaining after Dec 15, or before the cycle starts:** 0 after; full year before (Task 1).
4. **A request naming the borrower as a co-maker, the same founder twice, or a non-founder:** refused by the client (Task 1) and by the rules.
5. **The admin approving before both co-makers have approved:** button disabled, plus `canAdminApprove` (Task 1).

---

### Task 1: Pure logic: cycle, accounts, requests
**Files:** modify `src/rules.ts`, `src/rules.test.ts`; create `src/accounts.ts`, `src/accounts.test.ts`, `src/requests.ts`, `src/requests.test.ts`.

**Interfaces (Produces):**
```ts
// rules.ts (existing functions gain an optional cycle year, default 2026)
closedMonths(today: Date, year = 2026): number
missedMonths(m: Member, today: Date, year = 2026): number[]
memberSummary(m: Member, coop: CoopSummary, today: Date, year = 2026): MemberSummary
monthsLeft(today: Date, year = 2026): number          // whole months whose end date ≤ Dec 15 of `year`
regularTerms(left: number): (2|3|6)[]                  // [2,3,6] filtered to <= left
// Member gains: founder?: boolean
// accounts.ts
normalizeName(name: string): string                     // trim, collapse spaces, lowercase
startingPassword(name: string): string                  // remove all whitespace, keep case
loginKey(name: string): Promise<string>                 // sha256 hex of normalizeName via crypto.subtle
randomMemberEmail(): string                             // m-<20 [a-z0-9]>@members.hilas-coop.app
ADMIN_EMAIL = 'admin@hilas-coop.app'
FOUNDERS: string[]                                      // the 10 names
isFounderName(name: string): boolean                    // compared via normalizeName
// requests.ts
type LoanType = 'regular'|'flex'|'grocery'|'appliance'|'events'
type CoStatus = 'pending'|'approved'|'declined'
type LoanRequest = { id: string; borrowerId: string; borrowerName: string; type: LoanType; amount: number; months: number;
  quote: string; comakers: Record<string, { name: string; status: CoStatus; at?: number }>; comakerIds: string[];
  status: 'pending'|'approved'|'declined'|'withdrawn'; createdAt: number; decidedAt?: number }
validateRequest(input: { borrower: Member; comakerIds: string[]; founderIds: string[]; type: LoanType; amount: number; months: number;
  today: Date; year: number; hasPending: boolean }): string | null
canAdminApprove(r: LoanRequest): boolean                // pending && both comakers approved
requestStage(r: LoanRequest): string                    // 'Waiting for co-makers' | 'Waiting for admin' | 'Approved' | 'Declined' | 'Withdrawn'
```
- [ ] **Failing tests:**
  - `monthsLeft`: 8 Nov 2026 → 1; 20 Nov 2026 → 0; 3 Mar 2026 → 9; 16 Dec 2026 → 0; 1 Jun 2025 with year 2026 → 11 (counted from Jan 1); any 2027 date with year 2026 → 0.
  - `regularTerms`: 1 → []; 3 → [2,3]; 9 → [2,3,6].
  - `closedMonths(new Date(2027,0,9), 2027)` → 1.
  - `startingPassword('Mark Dave  Tumanda')` → `'MarkDaveTumanda'`.
  - `normalizeName(' Mark  Dave TUMANDA ')` → `'mark dave tumanda'`.
  - `loginKey` returns the same 64-hex string for differently spaced or capitalised names.
  - `randomMemberEmail` matches `/^m-[a-z0-9]{20}@members\.hilas-coop\.app$/`.
  - `isFounderName('jeram rey tejano')` → true; `'Bryan Kevin Tabuan'` → false.
  - `FOUNDERS.length === 10`.
  - `validateRequest`:
    - errors on self as co-maker, a duplicate co-maker, a non-founder, 1 co-maker, an amount over `loanLimit`, a regular term not in `regularTerms`, months > `monthsLeft`, `hasPending`, and any `regularLoan`/`monthlyLoanError` error
    - null for a valid flex request on 8 Nov 2026, 1 month
  - `canAdminApprove` is false while either co-maker is pending or declined, and true when both approved.
  - `requestStage` maps each case.
- [ ] **Run:** `npm test` → FAIL.
- [ ] **Implement:** `crypto.subtle.digest('SHA-256', …)`. Random email uses `crypto.getRandomValues`.
- [ ] **Run:** `npm test` → PASS. **Commit:** `feat: cycle-aware rules, account and loan-request logic`.

### Task 2: Firebase project, config, security rules
**Files:** create `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `src/firebase.ts`.
- [ ] **Create the project:**
  - `npx firebase-tools projects:create <id> --display-name "Hilas Coop"`. The id is `hilas-coop`, falling back to `hilas-coop-<4 digits>` if taken.
  - `apps:create WEB "Hilas Coop"`, then `apps:sdkconfig WEB`.
  - `firestore:databases:create "(default)" --location asia-southeast1`.
- [ ] **`src/firebase.ts`:** exports `app`, `auth`, `db` from the web config. The web config is public by design; it goes in source.
- [ ] **`firestore.rules`:** exactly the spec's Security rules, plus:
  - `founders/{uid}`: readable by signed-in members, writable by the admin.
  - `settings/{doc}`: readable when signed in, writable by the admin.
  - `logins`: `get` open, `list` denied.
  - co-maker update: only `comakers.<uid>`, plus `status → 'declined'` only when that co-maker declines.
  - `loanRequests` reads by `comakerIds`.
- [ ] **Deploy:** `firebase.json` hosting has `public: dist` and an SPA rewrite. Run `npx firebase-tools deploy --only firestore:rules,firestore:indexes` → expect "Deploy complete".
- [ ] **User steps (wait for "done"):**
  - In the Console, Authentication → Get started → Email/Password → Enable.
  - Users → Add user → `admin@hilas-coop.app` with their admin password.
- [ ] **Commit:** `feat: Firebase project config and security rules`.

### Task 3: Data access layer
**Files:** create `src/store.ts`. It holds all Firebase I/O, with no UI.

**Produces:**
- **Sign-in:** `signIn(name, password)`. Admin when `normalizeName(name)==='admin'`; otherwise via `logins`. Also `signOutUser()` and `onSession(cb)`, which yields `{kind:'admin'} | {kind:'member', uid} | null`.
- **Member data:** `watchMember(uid, cb)`, `watchSummary(cb)`, `watchCycle(cb)`, `listFounders(): Promise<{id,name}[]>`.
- **Loan requests:**
  - `createRequest(...)`
  - `watchMyRequests(uid, cb)`, `watchComakerRequests(uid, cb)`, `watchAllRequests(cb)`
  - `decideAsComaker(reqId, uid, 'approved'|'declined')`, `withdraw(reqId)`
  - `adminDecide(reqId, 'approved'|'declined')`
- **Passwords:** `changePassword(current, next)` re-authenticates first.
- **Admin:**
  - `watchAllMembers(cb)`
  - `addMember(name, heads, founder)` creates the sign-in account through a secondary app instance
  - `deleteMember(id)`
  - `resetLogin(id)`: a new account with the starting password; moves the member doc, founder entry, login doc and request references
  - `savePayments(id, paid, interest)`
  - `recomputeSummary()` writes `coop/summary` with `topBorrowerId`
  - `importFromSheet()` uses `loadMembers` and only runs when there are no members
  - `startCycle(year)`
- [ ] **Verify:** `npm run build` passes (type-level contract). `store.ts` has no unit tests: it needs live Firebase or the emulator, and the emulator needs Java. Ruling recorded.
- [ ] **Commit:** `feat: Firebase data layer`.

### Task 4: Login + member app
**Files:**
- create `src/Login.tsx`, `src/MemberApp.tsx`, `src/member-tabs.tsx` (Savings + coop section, Loans calc + request + my requests, Alerts, Account)
- reuse `PayRules` from `tabs.tsx`
- `App.tsx` becomes the session router

- [ ] **Login:** a Name + Password form with error copy "Name or password is wrong."
- [ ] **Member bottom tabs:**
  - Savings, Loans, Pay & Rules, Account
  - **Alerts** only when `member.founder`, with a pending-count badge
- [ ] **Loan request form:**
  - Type, Amount, Months (from `monthsLeft` / `regularTerms`)
  - Two co-maker selects drawn from founders minus self
  - Live `validateRequest` error
  - Submit → "Waiting for co-makers"
  - "My requests" list with `requestStage` and Withdraw
- [ ] **Account:** name, heads, monthly, member since, Change password (current, new, confirm; minimum 6 characters), Log out.
- [ ] **Verify:** `npm test && npm run build`. In the browser at 375px, check that Login renders and that a wrong name shows the error. Signing in needs a real password, so the user does it. **Commit:** `feat: member login, loan requests, alerts, account`.

### Task 5: Admin app
**Files:** create `src/AdminApp.tsx`.
- [ ] **Members tab:**
  - search and list (name, heads, saved)
  - tap → savings view (reusing `MySavings`) plus a 12-month editor for paid and interest → Save (then `recomputeSummary`)
  - Add member (name, heads, founder checkbox, shows the starting password)
  - Reset login
  - Delete (type the name to confirm)
- [ ] **Requests tab:**
  - pending first
  - each shows borrower, type, amount, months, quote, and co-makers with ✓ / ✗ / …
  - Approve is disabled unless `canAdminApprove`; Decline
- [ ] **Coop tab:**
  - totals
  - "Import 2026 from the sheet" (only when there are no members)
  - "Start new cycle" (type `START <year>`)
  - Log out
- [ ] **Verify:** `npm test && npm run build`. Browser check of the layout at 375px is done by the user after they sign in as admin. **Commit:** `feat: admin members, payments, requests, cycle`.

### Task 6: Hosting (after the user confirms)
- [ ] `npm run build && npx firebase-tools deploy --only hosting` → report the URL.
