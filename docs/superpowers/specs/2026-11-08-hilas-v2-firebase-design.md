# Hilas Coop v2: Accounts, Loan Requests, Admin (Firebase)

Date: 2026-11-08 · Status: draft for approval · Builds on `2026-11-08-hilas-app-design.md` (v1, read-only from the Google Sheet)

## Intent
The app becomes each member's own window into the coop and the admin's tool to run it. After this version the Google Sheet is retired: payments, interest, members and loan requests all live in Firebase. Members see only their own records. Loans are requested in the app and need two founding co-makers plus the admin's approval.

## Decided by the user
- **Storage:** Firebase. Claude creates a new project, `hilas-coop`, once the user signs in to the Firebase CLI.
- **Records:** the admin records monthly payments and interest in the app from now on. This year's data is imported once from the sheet.
- **Privacy:** members never see other members' names or numbers.
- **Login:** the starting password is the member's name with no spaces (e.g. `MarkDaveTumanda`). Members can change it in an **Account** tab.
- **Loan requests:** a loan request names exactly **2 co-makers**, chosen from the 10 founding members: Mark Anthony Ampo, Jeram Rey Tejano, Peter John Jose, Israil Parajes, Mark Dave Tumanda, Dawn Hope Tejano, Maricris Jose, Mary Joy Tabuan, Chariz Parajes, Joyma Tumanda.
- **Notifications:** founding members get a Notifications tab listing requests where they were picked. Approving puts a ✓ on their name for the admin.
- **Admin password:** chosen by the user and given in chat. It is set only in Firebase Auth at setup, and is never written into this repo, the app's code or any document, because the GitHub repo is public. The admin sees every member's savings and all loan requests, and approves loans.
- **Admin manages members:** only the admin adds and deletes members. Deleting is how a new yearly cycle starts.
- **Loan months:** only as many months as remain in the year.

## Calls made by Claude (open to change)
- **Login is Name + Password.** The name is typed, never chosen from a list. *Reason:* once a password can change, the app needs a stable name to find the account.
- **Passwords are case-sensitive.** This is the normal behaviour of Firebase Auth.
- **Months remaining** = whole months from today that still end on or before **December 15** of the cycle year. Example: 8 Nov → 1 (8 Dec ≤ 15 Dec); 20 Nov → 0 (20 Dec is past 15 Dec), so loans are closed.
  - Regular loans offer only the 2/3/6-month terms that fit.
  - Monthly-rate loans offer 1…remaining.
- **The admin's Approve button unlocks only when both co-makers have approved.** A decline from either co-maker or the admin closes the request as "Declined".
- **A member can withdraw a pending request.**
- **One pending request per member at a time.**
- **The Coop tab no longer names the top borrower.** It shows only totals and the rebate amount.
- **Delete is permanent.** It asks the admin to type the member's name. Deleting does not touch other members' loan requests that name them.
- **Logins are not built from names.** Each sign-in account gets a random email (`m-<random>@members.hilas-coop.app`).
  - A `logins/{sha256(normalized name)}` doc maps a typed name to that email. The rules allow `get` but not `list`, so nobody can enumerate names; a name is only found if you already know it.
  - This lets the admin, with no paid plan or server:
    - **Reset password:** make a fresh sign-in account with the starting password, move the member's data to it, and repoint the login doc.
    - **Re-add a deleted member.**
    - **Fix a typo in a name:** repoint the login doc.
- **The cycle year is data, not code.** `settings/cycle.year` (2026) feeds `rules.ts`.
  - **Admin → "Start new cycle"** sets the next year after the admin types `START <year>`. It deletes all member records, loan requests and login docs. The admin then adds that year's members.
  - The sheet import button only works for 2026.
- **Loans close once nothing fits before December 15** (around 15–20 November). This follows the user's months-remaining rule. In the current cycle, Regular loans already have no valid term on 8 Nov; monthly-rate loans (1 month) stay open until about 15 Nov.
- **Co-makers see the borrower's name and the loan details** (type, amount, months, quote). They need these to decide whether to vouch. It is the only place one member sees another's name.
- **Pay & Rules stays.** Bottom tabs, at most 5:
  - Members: **Savings**, **Loans**, **Pay & Rules**, **Account**, plus **Alerts** (Notifications) for founders.
  - The Coop totals move into a "Coop this year" section at the bottom of Savings.
- **v1 was never published** (local dev only), so there is no old link to retire.

## Goals
1. **Login screen:** Name and Password fields, the handbook band, no member list. "Log out" is in the Account tab.
2. **Member tabs:**
   - **My Savings:** as in v1, but read from Firebase.
   - **Coop this year:** totals only, as a section at the bottom of Savings.
   - **Pay & Rules:** as in v1.
   - **Loans:** calculator plus request form and "My requests" status list.
   - **Notifications:** founders only, with a badge count of pending items.
   - **Account:** details plus change password.
3. **Admin:** after logging in with the name `admin`, three tabs:
   - **Members:** list with search. Tapping a member opens their savings view plus an editor for each month's payment and interest. Add member; delete member.
   - **Loan requests:** pending first. Each shows borrower, type, amount, months, quote, and co-makers with ✓, ✗ or pending. Approve or Decline.
   - **Coop:** totals and dividend.
4. **One-time import:** an admin-only button, "Import 2026 from the sheet", available only while Firebase has no members. It uses v1's sheet reader to create every member account and fill paid and interest per month. Interest-only people (Vincent Batutay) come in as 0-head records without a login, so their interest still counts toward the dividend.
5. **Hosting:** deploy to Firebase Hosting so members open one link. This happens after the user confirms; publishing is outward-facing.

## Data (Firestore)
- **`members/{uid}`:** `name`, `heads`, `founder: bool`, `paid: number[12]`, `interest: number[12]`, `cycle: 2026`, `createdAt`, `hasLogin: bool`.
  - The doc id is the Firebase Auth uid, or an auto id for no-login records.
- **`coop/summary`:** `totalHeads`, `totalSavings`, `totalInterest`, `rebate`, `dividendPerHead`, `updatedAt`.
  - Written by the admin client after every admin edit, using v1's `coopSummary`, so members can read the totals without reading other members.
- **`loanRequests/{id}`:**
  - `borrowerId`, `borrowerName`, `type`, `amount`, `months`, `quote`
  - `comakers: { [memberId]: { name, status: 'pending'|'approved'|'declined', at } }`
  - `status: 'pending'|'approved'|'declined'|'withdrawn'`, `createdAt`, `decidedAt`
- **Auth:** email/password accounts with synthetic emails.
  - Members: `<name-lowercase-letters-only>@members.hilas-coop.app`
  - Admin: `admin@hilas-coop.app`
  - The admin password lives only in Firebase Auth, never in the app's code.

## Security rules (enforced by Firestore, not just the UI)
- **Admin** (`request.auth.token.email == 'admin@hilas-coop.app'`): read and write everything.
- **Member:**
  - Reads only `members/{their uid}`.
  - Reads `coop/summary`.
  - May never write `members`.
- **Loan requests:**
  - **Create:** the borrower only, with `borrowerId == uid`, `status == 'pending'`, and exactly 2 co-maker keys that are founder member ids and not the borrower.
  - **Read:** the borrower, the two co-makers named in it, and the admin.
  - **Co-maker update:** may change only `comakers.<their uid>.status/at`, and only while the request is pending.
  - **Borrower update:** may only set `status: 'withdrawn'` while pending.

## Non-goals (v2)
- Tracking loan repayments and balances, the old Borrowers ledger. Approved loans are listed; repayment tracking is a later version.
- Push or SMS notifications. Notifications are in-app only.
- Offline mode.
- Multiple cycles side by side.

## Anti-goals
- A member seeing another member's name or numbers anywhere, including network responses. Firestore rules enforce this.
- An admin password readable in the app bundle.
- Money maths drifting from the handbook. Reuse the tested `rules.ts`.

## Constraints and honest limits
- **Starting passwords are guessable.** Anyone who knows a member's full name can log in as them until that member changes their password. Firebase Auth's limit on repeated wrong attempts helps, but members should change their password.
- **Deleting a member keeps their sign-in account.** It removes their record and their login doc, and the rules then block that orphaned sign-in. Fully removing the account needs paid Cloud Functions, so it is out of scope. The orphans are harmless.
- **One sign-in step needs the user.** They run `npx firebase-tools login` in the terminal, approve in the browser, and turn on Email/Password sign-in in the Firebase console (one switch). Everything else Claude runs from the CLI.

## Left to the builder
- Exact screen layouts, inside the v1 design system (DESIGN.md).
- Loading, empty and error states.
- How the admin's month editor looks.
- The badge style.
