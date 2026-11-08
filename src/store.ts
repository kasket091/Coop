// The only module that talks to Firebase. Screens call these; rules.ts/requests.ts stay pure.
import { deleteApp, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword, EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential,
  signInWithEmailAndPassword, signOut, updatePassword,
} from 'firebase/auth'
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, setDoc, updateDoc, where, writeBatch,
  type DocumentReference, type Unsubscribe,
} from 'firebase/firestore'
import { ADMIN_EMAIL, isFounderName, loginKey, looksLikeStartingPassword, normalizeName, randomMemberEmail, startingPassword, startingPasswordFor } from './accounts'
import { loadMembers } from './data'
import { auth, db, firebaseConfig } from './firebase'
import type { LoanRequest } from './requests'
import { DEFAULT_CYCLE_YEAR, type CoopSummary, type Member } from './rules'
import { importRows, publicSummary, type Summary } from './summary'

export type { Summary }
/** `rebate` is this member's own top-borrower rebate (0 unless they are the top borrower). */
export type StoredMember = Member & { uid: string; cycle: number; createdAt: number; hasLogin: boolean; loginKey?: string; email?: string; rebate?: number }
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

/** Only a still-pending request can be decided, so a stale screen can't approve a withdrawn or declined loan. */
export const adminDecide = (id: string, status: 'approved' | 'declined') =>
  runTransaction(db, async (tx) => {
    const ref = doc(db, 'loanRequests', id)
    const snap = await tx.get(ref)
    if (snap.data()?.status !== 'pending') throw new Error('This request was already withdrawn or decided.')
    tx.update(ref, { status, decidedAt: Date.now() })
  })

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

export async function savePayments(uid: string, paid: number[], interest: number[], heads: number): Promise<void> {
  await updateDoc(doc(db, 'members', uid), { paid, interest, heads })
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
  for (const name of ['members', 'founders', 'logins', 'loanRequests']) {
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
