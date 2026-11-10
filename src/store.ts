// The only module that talks to Firebase. Screens call these; rules.ts/requests.ts stay pure.
import { deleteApp, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword, EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential,
  signInWithEmailAndPassword, signOut, updatePassword,
} from 'firebase/auth'
import {
  addDoc as addDocRaw, clearIndexedDbPersistence, collection, deleteDoc as deleteDocRaw, deleteField, doc, getDoc, getDocs, onSnapshot, query, runTransaction as runTransactionRaw,
  setDoc as setDocRaw, terminate, updateDoc as updateDocRaw, where, writeBatch as writeBatchRaw,
  type DocumentReference, type Transaction, type Unsubscribe,
} from 'firebase/firestore'
import { ADMIN_EMAIL, isBoardName, isFounderName, loginKey, recruiterOf, looksLikeStartingPassword, normalizeName, randomMemberEmail, startingPassword, startingPasswordFor } from './accounts'
import { auth, db, firebaseConfig } from './firebase'
import { ledgerFrom, monthRange, newestLiveForLoan, type Txn, type TxnKind } from './ledger'
import { balanceOf, customPayment, interestDueNow, loanPeriod, loanSnapshot, missedInterest, savingsPayback, monthInterest, nextRef, payInterest, principalOf, refLabel, savingsLoan, upfrontFix, settleInterest, type LoanRequest, type LoanSnapshot } from './requests'
import { DEFAULT_CYCLE_YEAR, type CoopSummary, type Member } from './rules'
import { importRows, publicSummary, type Summary } from './summary'
import { feeTopUps, payFromSavings } from './termination'
import { dueDay } from './format'
import { BACKUP_COLLECTIONS, makeBackup, type Backup } from './backup'

// Offline, Firestore would queue writes and send them later (a payment or void landing hours after it was typed):
// every write here refuses instead, and the screen shows the message. Reads still show the last loaded figures.
export const OFFLINE_MESSAGE = "You're offline, so nothing was saved. Try again when you're connected."
const online = () => { if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error(OFFLINE_MESSAGE) }
const guard = <F extends (...a: never[]) => unknown>(f: F) => ((...a: Parameters<F>) => { online(); return f(...a) }) as F
const addDoc = guard(addDocRaw), deleteDoc = guard(deleteDocRaw), setDoc = guard(setDocRaw), updateDoc = guard(updateDocRaw), runTransaction = guard(runTransactionRaw)
const writeBatch: typeof writeBatchRaw = (...a) => {
  const b = writeBatchRaw(...a)
  const commit = b.commit.bind(b)
  b.commit = () => { online(); return commit() }
  return b
}

export type { Summary }
/** `rebate` is this member's own top-borrower rebate (0 unless they are the top borrower). */
export type StoredMember = Member & {
  uid: string; cycle: number; createdAt: number; hasLogin: boolean; loginKey?: string; email?: string; rebate?: number
  sheetLoanBalance?: number
  /** uid of the board member who recruited them (their co-maker) */
  recruiterId?: string
  /** set by the admin: 3 carryover months in a row, then a 4th unpaid. Disables loans and the projected dividend. */
  terminated?: { at: number; reason: string; saved?: number; fee?: number; loansDeducted?: number; payout?: number; stillOwed?: number }
}
export type { Txn }
export type Session = { kind: 'admin' } | { kind: 'member'; uid: string } | null

const WRONG = 'Name or password is wrong.'
const zeros = () => Array<number>(12).fill(0)

// ---------- session ----------
export const onSession = (cb: (s: Session) => void): Unsubscribe =>
  onAuthStateChanged(auth, (u) => cb(!u ? null : u.email === ADMIN_EMAIL ? { kind: 'admin' } : { kind: 'member', uid: u.uid }))

// The phone remembers which account a typed name belongs to, so the next login skips that lookup (~0.5 s).
// Not secret: anyone can look a name up. A stale entry (the admin reset that login) is replaced on the next try.
const LOGIN_CACHE = 'hilas-login:'
type LoginRef = { email: string; name?: string }
const cachedLogin = (key: string): LoginRef | null => {
  try { const v = JSON.parse(localStorage.getItem(LOGIN_CACHE + key) ?? 'null'); return v?.email ? v : null } catch { return null }
}
const rememberLogin = (key: string, ref: LoginRef) => { try { localStorage.setItem(LOGIN_CACHE + key, JSON.stringify(ref)) } catch { /* no storage: just slower */ } }

async function signInAs(typedName: string, password: string, ref: LoginRef) {
  try {
    await signInWithEmailAndPassword(auth, ref.email, password)
  } catch (first) {
    // starting passwords work in any letter case ("markdavetumanda" = "MarkDaveTumanda"); changed passwords stay exact
    const exact = startingPasswordFor(typedName, ref.name)
    if (!looksLikeStartingPassword(typedName, password) || exact === password) throw first
    await signInWithEmailAndPassword(auth, ref.email, exact)
  }
}

export async function signIn(name: string, password: string): Promise<void> {
  try {
    if (normalizeName(name) === 'admin') {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password)
      return
    }
    const key = await loginKey(name)
    const cached = cachedLogin(key)
    if (cached) {
      try { await signInAs(name, password, cached); return } catch (e) {
        if ((e as { code?: string }).code?.includes('too-many-requests') || (e as { code?: string }).code?.includes('network')) throw e
      }
    }
    const login = await getDoc(doc(db, 'logins', key))
    if (!login.exists()) throw new Error(WRONG)
    const ref: LoginRef = { email: login.data().email as string, name: login.data().name as string | undefined }
    // same account as remembered: the password itself was wrong, so don't spend a second try on it
    if (cached?.email === ref.email) throw new Error(WRONG)
    await signInAs(name, password, ref)
    rememberLogin(key, ref)
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    if (code.includes('too-many-requests')) throw new Error('Too many tries. Wait a few minutes and try again.')
    if (code.includes('network')) throw new Error("Can't reach the coop server. Check your connection.")
    throw new Error(WRONG)
  }
}

const PUSH_KEY = 'hilas-push-token'

/** Saves this phone's push token under whoever is signed in; the Cloud Function finds people's phones by it. */
export async function savePushToken(token: string) {
  const user = auth.currentUser
  if (!user) return
  await setDoc(doc(db, 'pushTokens', token), { uid: user.uid, admin: user.email === ADMIN_EMAIL, at: Date.now() })
  try { localStorage.setItem(PUSH_KEY, token) } catch { /* private mode: the token is still saved */ }
}

export async function signOutUser() {
  // this phone stops getting the signed-out person's notifications
  try {
    const t = localStorage.getItem(PUSH_KEY)
    if (t) { await deleteDoc(doc(db, 'pushTokens', t)); localStorage.removeItem(PUSH_KEY) }
  } catch { /* offline or no storage: still sign out */ }
  await signOut(auth)
  // the next person on this phone must not see the last one's saved records: wipe them and start fresh
  try { await terminate(db); await clearIndexedDbPersistence(db) } catch { /* nothing saved */ }
  location.reload()
}

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


/** The handbook: a Google Drive (or any https) link the admin pastes; members open it in a new tab. */
export type Handbook = { url: string; updatedAt: number } | null
export const watchHandbook = (cb: (h: Handbook) => void) =>
  onSnapshot(doc(db, 'settings', 'handbook'), (s) => cb(s.exists() ? (s.data() as { url: string; updatedAt: number }) : null), () => cb(null))
export const saveHandbookLink = (url: string) => setDoc(doc(db, 'settings', 'handbook'), { url, updatedAt: Date.now() })

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

/** Write many document changes in batches of 400 (Firestore allows 500 per batch). */
async function commitChunks(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db)
    ops.slice(i, i + 400).forEach((op) => op(batch))
    await batch.commit()
  }
}

/** Rebuilds a member's 12-month savings/interest from their live transactions, then the coop totals. */
export async function rebuildLedger(memberId: string, year: number): Promise<void> {
  const mine = asTxns((await getDocs(query(txns, where('memberId', '==', memberId)))).docs)
  const { paid, interest, carried } = ledgerFrom(mine, year)
  await updateDoc(doc(db, 'members', memberId), { paid, interest, carried })
  await recomputeSummary(await allMembers())
}

/** Admin records savings or interest received (not tied to a loan). */
/** Savings received (the admin's Record savings). */
export async function addTransaction(m: StoredMember, amount: number, month: number, note: string, year: number) {
  if (!(amount > 0)) throw new Error('Enter an amount above ₱0.')
  if (m.terminated) throw new Error('This account is terminated. Restore it to record transactions.')
  await setDoc(doc(txns), txnRecord({ memberId: m.uid, memberName: m.name, kind: 'savings', amount, month, note }, year, Date.now()))
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
    if (newest && newest.createdAt !== t.createdAt) {
      const what = `${newest.kind === 'note' ? 'note' : `${php(newest.amount)} ${newest.kind}`} from ${new Date(newest.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
      throw new Error(`This loan has a newer entry (${what}: "${newest.note}"). Void that one first, then this one.`)
    }
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
    savingsSettled: b.savingsSettled ? true : deleteField(),
    ...(b.status === 'pending' ? { directApproval: deleteField() } : {}),
  })
}

/** Only a still-pending request can be decided. Approving records the loan going out (`release`). */
export async function adminDecide(id: string, status: 'approved' | 'declined', year: number, direct = false) {
  let memberId = ''
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'loanRequests', id)
    const snap = await tx.get(ref)
    const counterRef = doc(db, 'counters', `loans-${year}`)
    const counters = (await tx.get(counterRef)).data() ?? {}
    const r = { ...(snap.data() as LoanRequest), id }
    if (r.status !== 'pending') throw new Error('This request was already withdrawn or decided.')
    const now = Date.now()
    const next = status === 'approved' && !r.ref ? nextRef(counters, r.type, r.borrowerId) : null
    if (next) tx.set(counterRef, next.counters)
    tx.update(ref, { status, decidedAt: now, ...(direct ? { directApproval: true } : {}), ...(next ? { ref: next.ref, no: next.no } : {}),
      ...(status === 'approved' ? { balance: r.amount, principal: r.amount } : {}) })
    if (status === 'approved') {
      memberId = r.borrowerId
      tx.set(doc(txns), txnRecord({
        memberId: r.borrowerId, memberName: r.borrowerName, kind: 'release', amount: r.amount, loanId: id,
        note: `Loan ${refLabel(next ?? r)} approved${direct ? ' directly by the admin' : ''}`.replace('  ', ' '), loanBefore: loanSnapshot(r),
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
async function loanAction(id: string, year: number, act: (r: LoanRequest) => { update: Record<string, string | number | boolean>; entries: { kind: TxnKind; amount: number; note: string; carryover?: boolean; month?: number; settles?: boolean; period?: number; paidOn?: number }[] }) {
  let memberId = ''
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'loanRequests', id)
    const r = { ...((await tx.get(ref)).data() as LoanRequest), id }
    if (r.status !== 'approved') throw new Error('This loan is no longer open.')
    const { update, entries } = act(r)
    // a paid-off Savings Loan: the missed savings it covered now count as saved (voiding the payoff undoes it)
    // (not when Pay For Savings already counted them)
    if (update.status === 'paid' && r.type === 'savings' && r.carriedMonth !== undefined && !r.savingsSettled && !update.savingsSettled) {
      update.savingsSettled = true
      entries.push({ kind: 'savings', amount: r.amount, month: r.carriedMonth, settles: true, note: `${MONTH_NAMES[r.carriedMonth]} savings now saved: loan ${refLabel(r)} paid` })
    }
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
/** The loan's transactions, so a payment knows how much of this month's interest is still due. */
const loanTxns = async (id: string) => asTxns((await getDocs(query(txns, where('loanId', '==', id)))).docs)

/** This month's interest; or, when it already sits in the balance (Savings Loan upfront, a carryover), off the balance. */
export const payLoanInterest = async (id: string, year: number) => {
  const lt = await loanTxns(id)
  return loanAction(id, year, (r) => {
    const period = loanPeriod(r)
    const p = payInterest(r, interestDueNow(r, lt))
    if (!(p.collected > 0)) throw new Error("This period's interest is already paid.")
    const off = p.update.balance < balanceOf(r)
    const update: Record<string, string | number> = { ...p.update }
    if (p.update.balance <= 0) Object.assign(update, { status: 'paid', paidAt: Date.now() })
    return { update, entries: [{ kind: 'interest', amount: p.collected, period: period.n, note: off ? `Interest paid off the balance: now ${php(p.update.balance)} owed` : `Interest due ${dueDay(period.dueAt)} on ${php(balanceOf(r))}` }] }
  })
}

/** Pay For Savings: a Savings Loan's missed savings paid back. They count as saved for that month; the interest stays owed. */
export const payForSavings = (id: string, year: number) =>
  loanAction(id, year, (r) => {
    const p = savingsPayback(r)
    if (!p) throw new Error('The missed savings on this loan are already paid.')
    const label = r.carriedMonth !== undefined ? `${MONTH_NAMES[r.carriedMonth]} savings` : 'Missed savings'
    return {
      update: { ...p.update, ...(p.update.status ? { paidAt: Date.now() } : {}) },
      entries: [{ kind: 'savings', amount: p.amount, month: r.carriedMonth, settles: true, note: `${label} paid: ${php(p.amount)} (loan ${refLabel(r)})${p.update.balance > 0 ? `; ${php(p.update.balance)} interest still owed` : ''}` }],
    }
  })

/**
 * Any amount paid: interest first, then carried-over interest, then the amount borrowed. `at` is the day it was paid
 * (a late entry): its period and month follow that day. The entry is still dated now, so Void keeps its order.
 */
export const loanCustomPayment = async (id: string, year: number, amount: number, at = Date.now()) => {
  const lt = await loanTxns(id)
  return loanAction(id, year, (r) => {
    const paidDay = new Date(at + 8 * 3600_000) // Manila
    if (at > Date.now()) throw new Error("The date paid can't be in the future.")
    if (paidDay.getUTCFullYear() !== year) throw new Error(`Choose a date in ${year}.`)
    if (at < (r.decidedAt ?? r.createdAt) - 86_400_000) throw new Error(`This loan started ${dueDay(r.decidedAt ?? r.createdAt)}; choose that day or later.`)
    const period = loanPeriod(r, at)
    const p = customPayment(r, amount, interestDueNow(r, lt, at))
    if ('error' in p) throw new Error(p.error)
    const toPrincipal = Math.round((amount - p.collected) * 100) / 100
    const what = `Custom payment of ${php(amount)}${dueDay(at) === dueDay(Date.now()) ? '' : ` paid ${dueDay(at)}`}`
    const m = paidDay.getUTCMonth()
    const paidOn = dueDay(at) === dueDay(Date.now()) ? undefined : at
    return {
      update: { balance: p.balance, principal: p.principal, customPayments: (r.customPayments ?? 0) + 1, ...(p.paidOff ? { status: 'paid', paidAt: at } : {}) },
      entries: [
        ...(p.collected > 0 ? [{ kind: 'interest' as const, amount: p.collected, period: period.n, month: m, paidOn, note: `${what}: interest part` }] : []),
        ...(toPrincipal > 0 ? [{ kind: 'principal' as const, amount: toPrincipal, period: period.n, month: m, paidOn, note: `${what}: off the balance` }] : []),
      ],
    }
  })
}

/**
 * The admin corrects a loan's approval date (e.g. a loan entered late): its due dates follow, and the interest of any
 * period now overdue is added at once, the same as the daily run. Voiding it puts the old date and balance back.
 */
export const setLoanDate = async (id: string, year: number, decidedAt: number) => {
  const lt = await loanTxns(id)
  return loanAction(id, year, (r) => {
    if (r.type === 'savings') throw new Error("A Savings Loan's due dates follow its missed month, so its date can't be changed.")
    if (decidedAt > Date.now()) throw new Error("The date can't be in the future.")
    if (new Date(decidedAt + 8 * 3600_000).getUTCFullYear() !== year) throw new Error(`Choose a date in ${year}.`)
    const missed = missedInterest({ ...r, decidedAt }, lt)
    return {
      update: { decidedAt, ...(missed ? { balance: missed.balance, carryovers: missed.carryovers } : {}) },
      entries: [
        { kind: 'note', amount: 0, note: `Approval date changed: ${dueDay(r.decidedAt ?? r.createdAt)} → ${dueDay(decidedAt)}` },
        ...(missed?.entries ?? []).map((e) => ({
          kind: 'note' as const, amount: 0, carryover: true, period: e.period,
          note: `Carryover: ${php(e.due)} interest due ${dueDay(e.dueAt)} was not paid; balance now ${php(e.balance)}`,
        })),
      ],
    }
  })
}

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

type NewMember = { name: string; heads: number; founder: boolean; paid?: number[]; interest?: number[]; id?: number; year?: number; recruiterId?: string }

export async function addMember(m: NewMember, recompute = true): Promise<string> {
  const name = m.name.trim().replace(/\s+/g, ' ')
  const key = await loginKey(name)
  if ((await getDoc(doc(db, 'logins', key))).exists()) throw new Error(`${name} is already a member.`)
  const { uid, email } = await createLogin(name)
  const batch = writeBatch(db)
  const record: Omit<StoredMember, 'uid'> = {
    id: m.id ?? Date.now(), name, heads: m.heads, founder: m.founder, paid: m.paid ?? zeros(), interest: m.interest ?? zeros(),
    cycle: m.year ?? DEFAULT_CYCLE_YEAR, createdAt: Date.now(), hasLogin: true, loginKey: key, email, rebate: 0,
    ...(m.recruiterId && !m.founder ? { recruiterId: m.recruiterId } : {}),
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
  const moves: ((b: ReturnType<typeof writeBatch>) => void)[] = []
  for (const d of (await getDocs(query(txns, where('memberId', '==', m.uid)))).docs) moves.push((b) => b.update(d.ref, { memberId: uid }))
  for (const d of (await getDocs(query(collection(db, 'members'), where('recruiterId', '==', m.uid)))).docs) moves.push((b) => b.update(d.ref, { recruiterId: uid }))
  for (const d of (await getDocs(query(requests, where('borrowerId', '==', m.uid)))).docs) batch.update(d.ref, { borrowerId: uid })
  for (const d of (await getDocs(query(requests, where('comakerIds', 'array-contains', m.uid)))).docs) {
    const r = d.data() as LoanRequest
    const { [m.uid]: entry, ...rest } = r.comakers
    batch.update(d.ref, { comakerIds: r.comakerIds.map((id) => (id === m.uid ? uid : id)), comakers: { ...rest, [uid]: entry } })
  }
  await batch.commit()
  await commitChunks(moves) // their money history and their recruits follow them to the new login
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

/**
 * Missed savings carried over: the month counts as saved (red on the dashboard) and an approved 10%-a-month
 * Savings Loan (e.g. 1SL) is created at once, no co-maker or approval. Voiding it undoes all three.
 */
export async function carryOverSavings(m: StoredMember, month: number, amount: number, year: number): Promise<string> {
  if (!(amount > 0)) throw new Error('Enter the missed amount.')
  let loanRef = ''
  await runTransaction(db, async (tx) => {
    const counterRef = doc(db, 'counters', `loans-${year}`)
    const next = nextRef((await tx.get(counterRef)).data() ?? {}, 'savings', m.uid)
    loanRef = refLabel(next)
    const now = Date.now()
    const loanDoc = doc(requests)
    const loan = { ...savingsLoan({ borrowerId: m.uid, borrowerName: m.name, amount, month, ref: next.ref, now }), no: next.no }
    const label = refLabel(next)
    // voiding this group withdraws the loan (there is no "pending" stage to go back to)
    const loanBefore: LoanSnapshot = { ...loanSnapshot({ ...loan, id: loanDoc.id }), status: 'withdrawn' }
    const base = { memberId: m.uid, memberName: m.name, month, loanId: loanDoc.id, loanBefore }
    tx.set(counterRef, next.counters)
    tx.set(loanDoc, loan)
    tx.set(doc(txns), txnRecord({ ...base, kind: 'savings', amount, note: `${MONTH_NAMES[month]} savings carried over as loan ${label}` }, year, now))
    tx.set(doc(txns), txnRecord({ ...base, kind: 'release', amount, note: `Loan ${label}: missed ${MONTH_NAMES[month]} savings + 10% at once = ${php(loan.balance ?? amount)} owed, then 10% a month` }, year, now))
    tx.set(doc(txns), txnRecord({ ...base, kind: 'note', amount: 0, carryover: true, note: `${MONTH_NAMES[month]} carried over (${label})` }, year, now))
  })
  await rebuildLedger(m.uid, year)
  return loanRef
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * One-time correction for Savings Loans made before the 10% was added upfront: adds it (logged, voidable) and
 * rebuilds the borrower's totals so carried-over savings stop counting as saved.
 */
export async function fixSavingsLoans(year: number): Promise<void> {
  const old = asRequests((await getDocs(requests)).docs).filter((r) => r.status === 'approved' && upfrontFix(r))
  const borrowers = new Set<string>()
  for (const r of old) {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'loanRequests', r.id)
      const live = { ...((await tx.get(ref)).data() as LoanRequest), id: r.id }
      const fix = upfrontFix(live)
      if (!fix || live.status !== 'approved') return
      tx.update(ref, { balance: fix.balance, upfront: true })
      tx.set(doc(txns), txnRecord({
        memberId: live.borrowerId, memberName: live.borrowerName, kind: 'note', amount: 0, loanId: r.id, loanBefore: loanSnapshot(live),
        note: `Loan ${refLabel(live)}: 10% added at once (${php(fix.added)}), now ${php(fix.balance)} owed`,
      }, year, Date.now()))
    })
    borrowers.add(r.borrowerId)
  }
  // carried-over savings no longer count as saved: refresh anyone who has a Savings Loan
  for (const r of asRequests((await getDocs(query(requests, where('type', '==', 'savings')))).docs)) borrowers.add(r.borrowerId)
  for (const id of borrowers) await rebuildLedger(id, year)
}

/** Savings Loans paid before the rule above existed: their carried savings now count as saved (once). */
export const needsSavingsSettle = (r: LoanRequest) =>
  r.type === 'savings' && r.status === 'paid' && !r.closedNoMoney && !r.savingsSettled && r.carriedMonth !== undefined

export async function settlePaidSavingsLoans(year: number): Promise<void> {
  const borrowers = new Set<string>()
  for (const r of asRequests((await getDocs(query(requests, where('type', '==', 'savings')))).docs).filter(needsSavingsSettle)) {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'loanRequests', r.id)
      const live = { ...((await tx.get(ref)).data() as LoanRequest), id: r.id }
      if (!needsSavingsSettle(live)) return
      tx.update(ref, { savingsSettled: true })
      // no loanBefore: voiding this only moves the amount back to carried, the loan stays paid
      tx.set(doc(txns), txnRecord({
        memberId: live.borrowerId, memberName: live.borrowerName, kind: 'savings', amount: live.amount, month: live.carriedMonth, loanId: r.id, settles: true,
        note: `${MONTH_NAMES[live.carriedMonth!]} savings now saved: loan ${refLabel(live)} paid`,
      }, year, Date.now()))
    })
    borrowers.add(r.borrowerId)
  }
  for (const id of borrowers) await rebuildLedger(id, year)
}

/**
 * Loan references for the cycle (13SL #14). The first time, every loan approved this cycle is numbered in approval
 * order under this scheme; after that, only loans missing a reference get one.
 */
export async function ensureRefs(year: number): Promise<void> {
  const counterRef = doc(db, 'counters', `loans-${year}`)
  const fresh = !(await getDoc(counterRef)).data()?.scheme
  const loans = asRequests((await getDocs(requests)).docs)
    .filter((r) => (r.status === 'approved' || r.status === 'paid') && new Date(r.decidedAt ?? r.createdAt).getFullYear() === year && (fresh || !r.ref || !r.no))
    .sort((a, b) => (a.decidedAt ?? a.createdAt) - (b.decidedAt ?? b.createdAt))
  if (!loans.length && !fresh) return
  await runTransaction(db, async (tx) => {
    let counters: Record<string, number> = fresh ? {} : (await tx.get(counterRef)).data() ?? {}
    for (const r of loans) {
      const next = nextRef(counters, r.type, r.borrowerId)
      counters = next.counters
      tx.update(doc(db, 'loanRequests', r.id), { ref: next.ref, no: next.no })
    }
    tx.set(counterRef, { ...counters, scheme: 2 })
  })
}

/** Pays a loan from savings at termination: in full (closes it) or in part (stays active with the rest owed). */
type LoanActionResult = { update: Record<string, string | number | boolean>; entries: { kind: TxnKind; amount: number; note: string; carryover?: boolean; month?: number; settles?: boolean; period?: number }[] }

const payLoanFromSavings = (id: string, year: number, amount: number, full: boolean) =>
  loanAction(id, year, (r): LoanActionResult => {
    const note = 'Paid from savings at termination'
    if (full) {
      const interest = settleInterest(r)
      return {
        update: { status: 'paid', paidAt: Date.now() },
        entries: [
          ...(interest > 0 ? [{ kind: 'interest' as const, amount: interest, note: `${note} (interest part)` }] : []),
          { kind: 'principal', amount: Math.round(principalOf(r) * 100) / 100, note },
        ],
      }
    }
    const p = customPayment(r, amount, r.type === 'savings' ? 0 : undefined) // a Savings Loan has nothing due apart from what's owed
    if ('error' in p) throw new Error(p.error)
    const toPrincipal = Math.round((amount - p.collected) * 100) / 100
    return {
      update: { balance: p.balance, principal: p.principal, customPayments: (r.customPayments ?? 0) + 1 },
      entries: [
        ...(p.collected > 0 ? [{ kind: 'interest' as const, amount: p.collected, note: `${note}: part (interest)` }] : []),
        ...(toPrincipal > 0 ? [{ kind: 'principal' as const, amount: toPrincipal, note: `${note}: part (balance)` }] : []),
      ],
    }
  })

/**
 * Terminates a member (admin-confirmed). Their savings, less the 20% fee, pay their unpaid loans (oldest first,
 * then the old-sheet balance); paid loans close. The fee is recorded as interest collected from them.
 */
export async function terminateMember(m: StoredMember, reason: string, year: number, loans: LoanRequest[]) {
  const saved = Math.round(m.paid.reduce((a, b) => a + b, 0) * 100) / 100
  // what's left after 20% of the deposits pays the loans (the loan formula is unchanged)
  const afterFee = Math.round(saved * 0.8 * 100) / 100
  const open = loans.filter((r) => r.borrowerId === m.uid && r.status === 'approved').sort((a, b) => (a.decidedAt ?? a.createdAt) - (b.decidedAt ?? b.createdAt))
  const plan = payFromSavings(open.map((r) => ({ id: r.id, balance: balanceOf(r) })), m.sheetLoanBalance ?? 0, afterFee)
  for (const p of plan.payments) await payLoanFromSavings(p.id, year, p.amount, p.full)
  const loansDeducted = Math.round((plan.payments.reduce((t, p) => t + p.amount, 0) + plan.sheetPaid) * 100) / 100
  // Savings Loans paid in full just now count as saved; the fee is 20% of that total and the payout is what's left
  const settled = plan.payments.filter((p) => p.full).map((p) => open.find((r) => r.id === p.id)!)
    .filter((r) => r.type === 'savings' && r.carriedMonth !== undefined && !r.savingsSettled).reduce((t, r) => t + r.amount, 0)
  const total = Math.round((saved + settled) * 100) / 100
  const fee = Math.round(total * 0.2 * 100) / 100
  const payout = Math.max(0, Math.round((total - fee - loansDeducted) * 100) / 100)
  const now = Date.now()
  const batch = writeBatch(db)
  if (plan.sheetPaid > 0) {
    batch.update(doc(db, 'members', m.uid), { sheetLoanBalance: Math.round(((m.sheetLoanBalance ?? 0) - plan.sheetPaid) * 100) / 100 })
    batch.set(doc(txns), txnRecord({ memberId: m.uid, memberName: m.name, kind: 'note', amount: 0, note: `Old sheet loan balance: ${php(plan.sheetPaid)} paid from savings at termination` }, year, now))
  }
  if (fee > 0) batch.set(doc(txns), txnRecord({ memberId: m.uid, memberName: m.name, kind: 'interest', amount: fee, note: `Termination fee: 20% of ${php(total)} savings` }, year, now + 1))
  batch.update(doc(db, 'members', m.uid), { terminated: { at: now, reason, saved: total, fee, loansDeducted, payout, stillOwed: plan.stillOwed } })
  batch.set(doc(txns), txnRecord({ memberId: m.uid, memberName: m.name, kind: 'note', amount: 0, note: `Account terminated: ${reason}` }, year, now + 2))
  await batch.commit()
  await rebuildLedger(m.uid, year)
}

/** Books the termination-fee top-ups `feeTopUps` finds (one run at a time, so a fast re-render can't book twice). */
let toppingUp = false
export async function bookFeeTopUps(members: StoredMember[], all: Txn[], year: number) {
  const due = feeTopUps(members, all, year)
  if (toppingUp || !due.length) return
  toppingUp = true
  try {
    for (const d of due) {
      const m = members.find((x) => x.uid === d.uid)!
      const batch = writeBatch(db)
      batch.set(doc(txns), txnRecord({ memberId: m.uid, memberName: m.name, kind: 'interest', amount: d.add, month: d.month, note: `Termination fee top-up: 20% of ${php(d.saved)} savings (Savings Loans paid off now count)` }, year, Date.now()))
      const loansDeducted = m.terminated?.loansDeducted ?? 0
      batch.update(doc(db, 'members', m.uid), { 'terminated.saved': d.saved, 'terminated.fee': d.fee, 'terminated.payout': Math.max(0, Math.round((d.saved - d.fee - loansDeducted) * 100) / 100) })
      await batch.commit()
      await rebuildLedger(m.uid, year)
    }
  } finally { toppingUp = false }
}

export async function restoreMember(m: StoredMember, year: number) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'members', m.uid), { terminated: deleteField() })
  batch.set(doc(txns), txnRecord({ memberId: m.uid, memberName: m.name, kind: 'note', amount: 0, note: 'Account restored by the admin' }, year, Date.now()))
  await batch.commit()
  await recomputeSummary(await allMembers()) // a restored top borrower gets the 3% back
}

/** Sets (or clears) who recruited a member: that board member is their one co-maker. Logged in their history. */
export async function setRecruiter(m: StoredMember, recruiter: StoredMember | null, year: number) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'members', m.uid), { recruiterId: recruiter ? recruiter.uid : deleteField() })
  batch.set(doc(txns), txnRecord({ memberId: m.uid, memberName: m.name, kind: 'note', amount: 0,
    note: recruiter ? `Recruiter set to ${recruiter.name}` : 'Recruiter removed' }, year, Date.now()))
  await batch.commit()
}


/** Members can't read each other, so the admin publishes the totals they need after every change. */
export async function recomputeSummary(members: StoredMember[]): Promise<void> {
  const { summary, rebates } = publicSummary(members)
  const batch = writeBatch(db)
  batch.set(doc(db, 'coop', 'summary'), summary)
  for (const m of members) if ((m.rebate ?? 0) !== rebates[m.uid]) batch.update(doc(db, 'members', m.uid), { rebate: rebates[m.uid] })
  await batch.commit()
}

/** Rebuilds every member's 12-month totals from transactions (after a dropped connection, for example). */
export async function rebuildAllLedgers(year: number): Promise<void> {
  const [members, all] = [await allMembers(), asTxns((await getDocs(txns)).docs)]
  await commitChunks(members.map((m) => (b) => b.update(doc(db, 'members', m.uid), ledgerFrom(all.filter((t) => t.memberId === m.uid), year))))
  await recomputeSummary(await allMembers())
}

async function allMembers(): Promise<StoredMember[]> {
  return (await getDocs(collection(db, 'members'))).docs.map((d) => ({ ...(d.data() as StoredMember), uid: d.id }))
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

// ---------- backup, clear, restore (admin) ----------
/** Every document in every collection the app uses, as one backup. */
export async function exportDatabase(): Promise<Backup> {
  const collections: Backup['collections'] = {}
  for (const name of BACKUP_COLLECTIONS) {
    collections[name] = (await getDocs(collection(db, name))).docs.map((d) => ({ id: d.id, data: d.data() }))
  }
  return makeBackup(collections, Date.now())
}

/** Deletes every document the app uses. Sign-in accounts (passwords) are kept, so a restore brings logins back. */
export async function clearDatabase(onProgress: (msg: string) => void = () => {}): Promise<void> {
  for (const name of BACKUP_COLLECTIONS) {
    onProgress(`Clearing ${name}…`)
    const docs = (await getDocs(collection(db, name))).docs
    await commitChunks(docs.map((d) => (b) => b.delete(d.ref)))
  }
}

/** Replaces the whole database with a backup: clears everything, then writes the backup back exactly. */
export async function restoreDatabase(backup: Backup, onProgress: (msg: string) => void = () => {}): Promise<void> {
  await clearDatabase(onProgress)
  for (const name of BACKUP_COLLECTIONS) {
    const docs = backup.collections[name] ?? []
    onProgress(`Restoring ${name} (${docs.length})…`)
    await commitChunks(docs.map((d) => (b) => b.set(doc(db, name, d.id), d.data)))
  }
}
