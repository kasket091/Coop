// The only module that talks to Firebase. Screens call these; rules.ts/requests.ts stay pure.
import { deleteApp, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword, EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential,
  signInWithEmailAndPassword, signOut, updatePassword,
} from 'firebase/auth'
import {
  addDoc, collection, deleteField, doc, getDoc, getDocs, onSnapshot, query, runTransaction, setDoc, updateDoc, where, writeBatch,
  type DocumentReference, type Transaction, type Unsubscribe,
} from 'firebase/firestore'
import { ADMIN_EMAIL, isBoardName, isFounderName, loginKey, recruiterOf, looksLikeStartingPassword, normalizeName, randomMemberEmail, startingPassword, startingPasswordFor } from './accounts'
import { loadMembers } from './data'
import { auth, db, firebaseConfig } from './firebase'
import { ledgerFrom, newestLiveForLoan, type Txn, type TxnKind } from './ledger'
import { balanceOf, carryover, customPayment, loanSnapshot, monthInterest, payInterest, principalOf, settleInterest, type LoanRequest, type LoanSnapshot } from './requests'
import { DEFAULT_CYCLE_YEAR, type CoopSummary, type Member } from './rules'
import { importRows, publicSummary, type Summary } from './summary'

export type { Summary }
/** `rebate` is this member's own top-borrower rebate (0 unless they are the top borrower). */
export type StoredMember = Member & {
  uid: string; cycle: number; createdAt: number; hasLogin: boolean; loginKey?: string; email?: string; rebate?: number
  sheetLoanBalance?: number
  /** uid of the board member who recruited them (their co-maker) */
  recruiterId?: string
}
export type { Txn }
export type Session = { kind: 'admin' } | { kind: 'member'; uid: string } | null

const WRONG = 'Name or password is wrong.'
const zeros = () => Array<number>(12).fill(0)

// ---------- session ----------
export const onSession = (cb: (s: Session) => void): Unsubscribe =>
  onAuthStateChanged(auth, (u) => cb(!u ? null : u.email === ADMIN_EMAIL ? { kind: 'admin' } : { kind: 'member', uid: u.uid }))

export async function signIn(name: string, password: string): Promise<void> {
  try {
    if (normalizeName(name) === 'admin') {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password)
      return
    }
    const login = await getDoc(doc(db, 'logins', await loginKey(name)))
    if (!login.exists()) throw new Error(WRONG)
    const email = login.data().email as string
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (first) {
      // starting passwords work in any letter case ("markdavetumanda" = "MarkDaveTumanda"); changed passwords stay exact
      const exact = startingPasswordFor(name, login.data().name as string | undefined)
      if (!looksLikeStartingPassword(name, password) || exact === password) throw first
      await signInWithEmailAndPassword(auth, email, exact)
    }
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    if (code.includes('too-many-requests')) throw new Error('Too many tries. Wait a few minutes and try again.')
    if (code.includes('network')) throw new Error("Can't reach the coop server. Check your connection.")
    throw new Error(WRONG)
  }
}

export const signOutUser = () => signOut(auth)

export async function changePassword(current: string, next: string): Promise<void> {
  const user = auth.currentUser
  if (!user?.email) throw new Error('Log in again first.')
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current))
  } catch {
    throw new Error('Your current password is wrong.')
  }
  await updatePassword(user, next)
}

// ---------- member reads ----------
export const watchMember = (uid: string, cb: (m: StoredMember | null) => void) =>
  onSnapshot(doc(db, 'members', uid), (s) => cb(s.exists() ? ({ ...(s.data() as StoredMember), uid: s.id }) : null))

export const watchSummary = (cb: (s: Summary | null) => void) =>
  onSnapshot(doc(db, 'coop', 'summary'), (s) => cb(s.exists() ? (s.data() as Summary) : null))

export const watchCycle = (cb: (year: number) => void) =>
  onSnapshot(doc(db, 'settings', 'cycle'), (s) => cb((s.data()?.year as number) ?? DEFAULT_CYCLE_YEAR))

export async function listFounders(): Promise<{ id: string; name: string }[]> {
  const snap = await getDocs(collection(db, 'founders'))
  return snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })).sort((a, b) => a.name.localeCompare(b.name))
}

/** The summary as rules.ts expects it, from one member's point of view: only the top borrower sees a rebate, their own. */
export function summaryFor(s: Summary | null, me: StoredMember): CoopSummary {
  const rebate = me.rebate ?? 0
  return {
    totalHeads: s?.totalHeads ?? 0, totalSavings: s?.totalSavings ?? 0, totalInterest: s?.totalInterest ?? 0,
    dividendPerHead: s?.dividendPerHead ?? 0,
    top: rebate > 0 ? { name: me.name, interest: rebate / 0.03, rebate } : null,
  }
}

// ---------- loan requests ----------
const requests = collection(db, 'loanRequests')
const asRequests = (docs: { id: string; data: () => unknown }[]) =>
  docs.map((d) => ({ ...(d.data() as LoanRequest), id: d.id })).sort((a, b) => b.createdAt - a.createdAt)

export const createRequest = (r: Omit<LoanRequest, 'id'>) => addDoc(requests, r)

export const watchMyRequests = (uid: string, cb: (r: LoanRequest[]) => void) =>
  onSnapshot(query(requests, where('borrowerId', '==', uid)), (s) => cb(asRequests(s.docs)))

export const watchComakerRequests = (uid: string, cb: (r: LoanRequest[]) => void) =>
  onSnapshot(query(requests, where('comakerIds', 'array-contains', uid)), (s) => cb(asRequests(s.docs)))

export const watchAllRequests = (cb: (r: LoanRequest[]) => void) => onSnapshot(requests, (s) => cb(asRequests(s.docs)))

export function decideAsComaker(r: LoanRequest, uid: string, status: 'approved' | 'declined') {
  return updateDoc(doc(db, 'loanRequests', r.id), {
    [`comakers.${uid}`]: { name: r.comakers[uid].name, status, at: Date.now() },
    ...(status === 'declined' ? { status: 'declined' } : {}),
  })
}

export const withdrawRequest = (id: string) => updateDoc(doc(db, 'loanRequests', id), { status: 'withdrawn' })

/** Ledger month for money received today (clamped to the cycle). */
export const ledgerMonth = (year: number, today = new Date()) =>
  today.getFullYear() < year ? 0 : today.getFullYear() > year ? 11 : today.getMonth()

// ---------- transactions ----------
const txns = collection(db, 'transactions')
const asTxns = (docs: { id: string; data: () => unknown }[]) =>
  docs.map((d) => ({ ...(d.data() as Txn), id: d.id })).sort((a, b) => b.createdAt - a.createdAt)

export const watchMyTransactions = (uid: string, cb: (t: Txn[]) => void) =>
  onSnapshot(query(txns, where('memberId', '==', uid)), (s) => cb(asTxns(s.docs)))

export const watchAllTransactions = (cb: (t: Txn[]) => void) => onSnapshot(txns, (s) => cb(asTxns(s.docs)))

type NewTxn = Omit<Txn, 'id' | 'createdAt' | 'cycle' | 'month'> & { month?: number }
const txnRecord = (t: NewTxn, year: number, createdAt: number) =>
  Object.fromEntries(Object.entries({ ...t, month: t.month ?? ledgerMonth(year), cycle: year, createdAt }).filter(([, v]) => v !== undefined))

/** Rebuilds a member's 12-month savings/interest from their live transactions, then the coop totals. */
export async function rebuildLedger(memberId: string, year: number): Promise<void> {
  const mine = asTxns((await getDocs(query(txns, where('memberId', '==', memberId)))).docs)
  const { paid, interest } = ledgerFrom(mine, year)
  await updateDoc(doc(db, 'members', memberId), { paid, interest })
  await recomputeSummary(await allMembers())
}

/** Admin records savings or interest received (not tied to a loan). */
export async function addTransaction(m: StoredMember, kind: 'savings' | 'interest', amount: number, month: number, note: string, year: number) {
  if (!(amount > 0)) throw new Error('Enter an amount above ₱0.')
  await setDoc(doc(txns), txnRecord({ memberId: m.uid, memberName: m.name, kind, amount, month, note }, year, Date.now()))
  await rebuildLedger(m.uid, year)
}

/**
 * Voids a transaction (it stays visible, crossed out). A loan transaction can only be voided while it is that
 * loan's newest, and voiding puts the loan back exactly as it was before (a voided approval returns to pending).
 */
export async function voidTransaction(t: Txn, reason: string, year: number): Promise<void> {
  if (!reason.trim()) throw new Error('Give a reason for voiding.')
  const group = [t]
  if (t.loanId) {
    const loanTxns = asTxns((await getDocs(query(txns, where('loanId', '==', t.loanId)))).docs)
    const newest = newestLiveForLoan(loanTxns, t.loanId)
    if (newest && newest.createdAt !== t.createdAt) throw new Error('Void the newer entries for this loan first.')
    group.splice(0, 1, ...loanTxns.filter((x) => !x.voidedAt && x.createdAt === t.createdAt))
  }
  await runTransaction(db, async (tx) => {
    const before = group.find((x) => x.loanBefore)?.loanBefore
    if (t.loanId && before) restoreLoan(tx, t.loanId, before)
    for (const x of group) tx.update(doc(db, 'transactions', x.id), { voidedAt: Date.now(), voidReason: reason.trim() })
  })
  await rebuildLedger(t.memberId, year)
}

function restoreLoan(tx: Transaction, loanId: string, b: LoanSnapshot) {
  tx.update(doc(db, 'loanRequests', loanId), {
    status: b.status, balance: b.balance, principal: b.principal,
    carryovers: b.carryovers, interestPayments: b.interestPayments, customPayments: b.customPayments,
    paidAt: b.paidAt ?? deleteField(), decidedAt: b.decidedAt ?? deleteField(),
    ...(b.status === 'pending' ? { directApproval: deleteField() } : {}),
  })
}

/** Only a still-pending request can be decided. Approving records the loan going out (`release`). */
export async function adminDecide(id: string, status: 'approved' | 'declined', year: number, direct = false) {
  let memberId = ''
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'loanRequests', id)
    const snap = await tx.get(ref)
    const r = { ...(snap.data() as LoanRequest), id }
    if (r.status !== 'pending') throw new Error('This request was already withdrawn or decided.')
    const now = Date.now()
    tx.update(ref, { status, decidedAt: now, ...(direct ? { directApproval: true } : {}), ...(status === 'approved' ? { balance: r.amount, principal: r.amount } : {}) })
    if (status === 'approved') {
      memberId = r.borrowerId
      tx.set(doc(txns), txnRecord({
        memberId: r.borrowerId, memberName: r.borrowerName, kind: 'release', amount: r.amount, loanId: id,
        note: `Loan approved${direct ? ' directly by the admin' : ''}`, loanBefore: loanSnapshot(r),
      }, year, now))
    }
  })
  if (memberId) await rebuildLedger(memberId, year)
}

/**
 * Admin loan actions on an approved loan. Each writes its transactions (with the loan as it was before, so it
 * can be voided) and updates the loan. Interest actually paid counts toward the dividend; carried interest
 * only once it is paid.
 */
async function loanAction(id: string, year: number, act: (r: LoanRequest) => { update: Record<string, string | number>; entries: { kind: TxnKind; amount: number; note: string }[] }) {
  let memberId = ''
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'loanRequests', id)
    const r = { ...((await tx.get(ref)).data() as LoanRequest), id }
    if (r.status !== 'approved') throw new Error('This loan is no longer open.')
    const { update, entries } = act(r)
    const now = Date.now()
    tx.update(ref, update)
    for (const e of entries) {
      tx.set(doc(txns), txnRecord({ memberId: r.borrowerId, memberName: r.borrowerName, loanId: id, loanBefore: loanSnapshot(r), ...e }, year, now))
    }
    memberId = r.borrowerId
  })
  await rebuildLedger(memberId, year)
}

const php = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`

/** Fully paid: closes the loan; carried-over (or a regular loan's flat) interest is recorded as collected. */
export const markLoanPaid = (id: string, year: number) =>
  loanAction(id, year, (r) => {
    const interest = settleInterest(r)
    const principal = Math.round(principalOf(r) * 100) / 100
    return {
      update: { status: 'paid', paidAt: Date.now() },
      entries: [
        ...(interest > 0 ? [{ kind: 'interest' as const, amount: interest, note: 'Interest collected when the loan was paid off' }] : []),
        { kind: 'principal', amount: principal, note: 'Loan paid in full' },
      ],
    }
  })

/** The borrower paid this month's interest only; the balance stays. */
export const payLoanInterest = (id: string, year: number) =>
  loanAction(id, year, (r) => {
    const p = payInterest(r)
    return { update: p.update, entries: [{ kind: 'interest', amount: p.collected, note: `This month's interest on ${php(balanceOf(r))}` }] }
  })

/** Any amount paid this month: interest first, then carried-over interest, then the amount borrowed. */
export const loanCustomPayment = (id: string, year: number, amount: number) =>
  loanAction(id, year, (r) => {
    const p = customPayment(r, amount)
    if ('error' in p) throw new Error(p.error)
    const toPrincipal = Math.round((amount - p.collected) * 100) / 100
    return {
      update: { balance: p.balance, principal: p.principal, customPayments: (r.customPayments ?? 0) + 1, ...(p.paidOff ? { status: 'paid', paidAt: Date.now() } : {}) },
      entries: [
        ...(p.collected > 0 ? [{ kind: 'interest' as const, amount: p.collected, note: `Custom payment of ${php(amount)}: interest part` }] : []),
        ...(toPrincipal > 0 ? [{ kind: 'principal' as const, amount: toPrincipal, note: `Custom payment of ${php(amount)}: off the balance` }] : []),
      ],
    }
  })

/** Interest not paid: it is added to the balance and next month is charged on the new balance. */
export const carryOverLoan = (id: string, year: number) =>
  loanAction(id, year, (r) => ({
    update: carryover(r),
    entries: [{ kind: 'note', amount: 0, note: `Carryover: ${php(monthInterest(r))} interest added; balance now ${php(balanceOf(r) + monthInterest(r))}` }],
  }))

// ---------- admin ----------
export const watchAllMembers = (cb: (m: StoredMember[]) => void) =>
  onSnapshot(collection(db, 'members'), (s) =>
    cb(s.docs.map((d) => ({ ...(d.data() as StoredMember), uid: d.id })).sort((a, b) => a.name.localeCompare(b.name))))

/** Makes a sign-in account without signing the admin out (a throwaway second Firebase app does the sign-up). */
async function createLogin(name: string): Promise<{ uid: string; email: string }> {
  const password = startingPassword(name)
  if (password.length < 6) throw new Error('Names need at least 6 letters for a starting password.')
  const second = initializeApp(firebaseConfig, `create-${Date.now()}-${Math.random()}`)
  try {
    const email = randomMemberEmail()
    const cred = await createUserWithEmailAndPassword(getAuth(second), email, password)
    await signOut(getAuth(second))
    return { uid: cred.user.uid, email }
  } finally {
    await deleteApp(second)
  }
}

type NewMember = { name: string; heads: number; founder: boolean; paid?: number[]; interest?: number[]; id?: number; year?: number }

export async function addMember(m: NewMember, recompute = true): Promise<string> {
  const name = m.name.trim().replace(/\s+/g, ' ')
  const key = await loginKey(name)
  if ((await getDoc(doc(db, 'logins', key))).exists()) throw new Error(`${name} is already a member.`)
  const { uid, email } = await createLogin(name)
  const batch = writeBatch(db)
  const record: Omit<StoredMember, 'uid'> = {
    id: m.id ?? Date.now(), name, heads: m.heads, founder: m.founder, paid: m.paid ?? zeros(), interest: m.interest ?? zeros(),
    cycle: m.year ?? DEFAULT_CYCLE_YEAR, createdAt: Date.now(), hasLogin: true, loginKey: key, email, rebate: 0,
  }
  batch.set(doc(db, 'members', uid), record)
  batch.set(doc(db, 'logins', key), { email, name })
  if (m.founder) batch.set(doc(db, 'founders', uid), { name })
  await batch.commit()
  if (recompute) await recomputeSummary(await allMembers())
  return uid
}

export async function deleteMember(m: StoredMember): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'members', m.uid))
  batch.delete(doc(db, 'founders', m.uid))
  if (m.loginKey) batch.delete(doc(db, 'logins', m.loginKey))
  await batch.commit()
  await recomputeSummary(await allMembers())
}

/** Forgotten password: a fresh sign-in account with the starting password; records and requests move with it. */
export async function resetLogin(m: StoredMember): Promise<void> {
  const { uid, email } = await createLogin(m.name)
  const batch = writeBatch(db)
  const { uid: _old, ...data } = m
  batch.set(doc(db, 'members', uid), { ...data, email })
  batch.delete(doc(db, 'members', m.uid))
  if (m.founder) { batch.set(doc(db, 'founders', uid), { name: m.name }); batch.delete(doc(db, 'founders', m.uid)) }
  if (m.loginKey) batch.set(doc(db, 'logins', m.loginKey), { email, name: m.name })
  for (const d of (await getDocs(query(requests, where('borrowerId', '==', m.uid)))).docs) batch.update(d.ref, { borrowerId: uid })
  for (const d of (await getDocs(query(requests, where('comakerIds', 'array-contains', m.uid)))).docs) {
    const r = d.data() as LoanRequest
    const { [m.uid]: entry, ...rest } = r.comakers
    batch.update(d.ref, { comakerIds: r.comakerIds.map((id) => (id === m.uid ? uid : id)), comakers: { ...rest, [uid]: entry } })
  }
  await batch.commit()
  await recomputeSummary(await allMembers())
}

export async function renameMember(m: StoredMember, newName: string): Promise<void> {
  const name = newName.trim().replace(/\s+/g, ' ')
  const key = await loginKey(name)
  if (key !== m.loginKey && (await getDoc(doc(db, 'logins', key))).exists()) throw new Error(`${name} is already a member.`)
  const batch = writeBatch(db)
  batch.update(doc(db, 'members', m.uid), { name, loginKey: key })
  if (m.loginKey && m.email) { batch.delete(doc(db, 'logins', m.loginKey)); batch.set(doc(db, 'logins', key), { email: m.email, name }) }
  if (m.founder) batch.set(doc(db, 'founders', m.uid), { name })
  await batch.commit()
}

/** The member's unpaid balance from the old Borrowers sheet: typed by the admin, every change logged. */
export async function saveSheetLoanBalance(m: StoredMember, amount: number, year: number) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'members', m.uid), { sheetLoanBalance: amount })
  batch.set(doc(txns), txnRecord({ memberId: m.uid, memberName: m.name, kind: 'note', amount: 0,
    note: `Old sheet loan balance changed ${php(m.sheetLoanBalance ?? 0)} → ${php(amount)}` }, year, Date.now()))
  await batch.commit()
}

export const saveHeads = (uid: string, heads: number) => updateDoc(doc(db, 'members', uid), { heads })

// ---------- one-time switch to transactions (v3) ----------
export type ResyncRow = { name: string; isNew: boolean; savingsNow: number; savingsSheet: number; interestNow: number; interestSheet: number }

export const watchMigrated = (cb: (done: boolean) => void) =>
  onSnapshot(doc(db, 'settings', 'migration'), (s) => cb(!!s.data()?.v3))

const sumOf = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100

/** What the re-sync would change, per member (app now → sheet). */
export async function previewResync(): Promise<ResyncRow[]> {
  const [sheet, members] = [await loadMembers(), await allMembers()]
  return sheet.map((row) => {
    const m = members.find((x) => normalizeName(x.name) === normalizeName(row.name))
    return { name: row.name, isNew: !m, savingsNow: sumOf(m?.paid ?? []), savingsSheet: sumOf(row.paid), interestNow: sumOf(m?.interest ?? []), interestSheet: sumOf(row.interest) }
  })
}

/**
 * Turns the current sheet into opening transactions ("From the 2026 sheet"), adds anyone new, sets recruiters and
 * board members, rebuilds every ledger, and records that it ran. Runs once.
 */
export async function runResync(onProgress: (msg: string) => void): Promise<void> {
  const year = 2026
  if ((await getDoc(doc(db, 'settings', 'migration'))).data()?.v3) throw new Error('The re-sync already ran.')
  const sheet = await loadMembers()
  for (const row of importRows(sheet, (await allMembers()).map((m) => m.name))) {
    onProgress(`Adding ${row.name}…`)
    if (row.heads > 0) await addMember({ name: row.name, heads: row.heads, founder: isBoardName(row.name), id: row.id, year }, false)
  }
  const members = await allMembers()
  const byName = (n: string) => members.find((m) => normalizeName(m.name) === normalizeName(n))
  const writes: { ref: DocumentReference; data: Record<string, unknown> }[] = []
  const now = Date.now()
  for (const row of sheet) {
    const m = byName(row.name)
    if (!m) continue
    row.paid.forEach((amount, month) => { if (amount > 0) writes.push({ ref: doc(txns), data: txnRecord({ memberId: m.uid, memberName: m.name, kind: 'savings', amount, month, note: 'From the 2026 sheet' }, year, now) }) })
    row.interest.forEach((amount, month) => { if (amount > 0) writes.push({ ref: doc(txns), data: txnRecord({ memberId: m.uid, memberName: m.name, kind: 'interest', amount, month, note: 'From the 2026 sheet' }, year, now) }) })
  }
  for (const m of members) {
    const recruiter = recruiterOf(m.name)
    const board = isBoardName(m.name)
    writes.push({ ref: doc(db, 'members', m.uid), data: { founder: board, ...(recruiter ? { recruiterId: byName(recruiter)?.uid ?? deleteField() } : {}) } })
    if (board) writes.push({ ref: doc(db, 'founders', m.uid), data: { name: m.name } })
  }
  for (let i = 0; i < writes.length; i += 400) {
    onProgress(`Saving ${Math.min(i + 400, writes.length)} of ${writes.length}…`)
    const batch = writeBatch(db)
    writes.slice(i, i + 400).forEach((w) => batch.set(w.ref, w.data, { merge: true }))
    await batch.commit()
  }
  onProgress('Rebuilding every member\'s totals…')
  const all = asTxns((await getDocs(txns)).docs)
  const batch = writeBatch(db)
  for (const m of members) {
    const { paid, interest } = ledgerFrom(all.filter((t) => t.memberId === m.uid), year)
    batch.update(doc(db, 'members', m.uid), { paid, interest })
  }
  batch.set(doc(db, 'settings', 'migration'), { v3: Date.now() })
  await batch.commit()
  await recomputeSummary(await allMembers())
}

/** Members can't read each other, so the admin publishes the totals they need after every change. */
export async function recomputeSummary(members: StoredMember[]): Promise<void> {
  const { summary, rebates } = publicSummary(members)
  const batch = writeBatch(db)
  batch.set(doc(db, 'coop', 'summary'), summary)
  for (const m of members) if ((m.rebate ?? 0) !== rebates[m.uid]) batch.update(doc(db, 'members', m.uid), { rebate: rebates[m.uid] })
  await batch.commit()
}

async function allMembers(): Promise<StoredMember[]> {
  return (await getDocs(collection(db, 'members'))).docs.map((d) => ({ ...(d.data() as StoredMember), uid: d.id }))
}

/** Moves the 2026 sheet into Firebase. Safe to run again: anyone already imported is skipped. */
export async function importFromSheet(onProgress: (done: number, total: number) => void): Promise<number> {
  const rows = importRows(await loadMembers(), (await allMembers()).map((m) => m.name))
  let done = 0
  for (const m of rows) {
    if (m.heads > 0) {
      await addMember({ name: m.name, heads: m.heads, founder: isFounderName(m.name), paid: m.paid, interest: m.interest, id: m.id, year: 2026 }, false)
    } else {
      // left the coop but their interest was collected, so it still counts toward the dividend
      const ref: DocumentReference = doc(collection(db, 'members'))
      await setDoc(ref, { id: m.id, name: m.name, heads: 0, founder: false, paid: m.paid, interest: m.interest, cycle: 2026, createdAt: Date.now(), hasLogin: false, rebate: 0 })
    }
    onProgress(++done, rows.length)
  }
  await setDoc(doc(db, 'settings', 'cycle'), { year: 2026 })
  await recomputeSummary(await allMembers())
  return done
}

/** New yearly cycle: clears members, logins, founders and loan requests, then sets the year. */
export async function startCycle(year: number): Promise<void> {
  for (const name of ['members', 'founders', 'logins', 'loanRequests', 'transactions']) {
    const docs = (await getDocs(collection(db, name))).docs
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db)
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
  }
  await setDoc(doc(db, 'settings', 'cycle'), { year })
  await recomputeSummary([])
}
