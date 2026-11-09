// Push notifications for loan requests. The functions only read and send (and drop dead phone tokens): they never
// write to loanRequests, so they can't trigger themselves.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import type { Txn } from '../../src/ledger'
import { balanceOf, loanSnapshot, missedInterest, type LoanRequest } from '../../src/requests'
import { messagesFor, type Message, type Req } from './messages'

initializeApp()
// Singapore, next to the database; at most 2 copies running at once keeps any mistake cheap
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 2 })

const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'])

/** Phone tokens for a member uid, or for the admin. */
async function tokensFor(to: string): Promise<string[]> {
  const tokens = getFirestore().collection('pushTokens')
  const snap = await (to === 'admin' ? tokens.where('admin', '==', true) : tokens.where('uid', '==', to)).get()
  return snap.docs.map((d) => d.id)
}

async function send(m: Message) {
  const tokens = await tokensFor(m.to)
  if (!tokens.length) return
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    // data only: the app's service worker shows it (title, body; tapping opens the app)
    data: { title: m.title, body: m.body },
    webpush: { headers: { Urgency: 'high', TTL: String(24 * 60 * 60) } },
  })
  const dead = res.responses.map((r, i) => (!r.success && DEAD.has(r.error?.code ?? '') ? tokens[i] : null)).filter((t): t is string => !!t)
  if (dead.length) {
    const db = getFirestore()
    await Promise.all(dead.map((t) => db.collection('pushTokens').doc(t).delete()))
  }
}

export const loanRequestPush = onDocumentWritten('loanRequests/{id}', async (event) => {
  const after = event.data?.after.data() as Req | undefined
  if (!after) return // deleted
  const before = event.data?.before.exists ? (event.data.before.data() as Req) : undefined
  await Promise.all(messagesFor(before, after).map(send))
})


const php = (n: number) => `₱${(Math.round(n * 100) / 100).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
const day = (ms: number) => new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })

/**
 * Every day at 12:05 AM (Philippine time): each loan's interest periods whose due day has ended and that are still
 * unpaid are added to its balance, the same as the admin's Carryover button (oldest first; a loan that missed several,
 * such as an old Savings Loan, gets them all at once). All of one loan's are written together: one Void undoes them,
 * and the loan update notifies the borrower once through loanRequestPush. Nothing runs past Dec 15. Running twice adds
 * nothing: a carried-over period has no interest left due.
 */
export const dailyInterestCarryover = onSchedule({ schedule: '5 0 * * *', timeZone: 'Asia/Manila' }, async () => {
  const db = getFirestore()
  const now = Date.now()
  const loans = await db.collection('loanRequests').where('status', '==', 'approved').get()
  // a terminated account is closed: its loans are settled by the admin, never changed automatically
  const terminated = new Set((await db.collection('members').get()).docs.filter((m) => m.data().terminated).map((m) => m.id))
  for (const d of loans.docs) {
    const r = { ...(d.data() as LoanRequest), id: d.id }
    if (terminated.has(r.borrowerId)) continue
    const txns = (await db.collection('transactions').where('loanId', '==', d.id).get()).docs.map((t) => ({ ...(t.data() as Txn), id: t.id }))
    const missed = missedInterest(r, txns, now)
    if (!missed) continue
    await db.runTransaction(async (tx) => {
      const live = { ...((await tx.get(d.ref)).data() as LoanRequest), id: d.id }
      if (live.status !== 'approved' || balanceOf(live) !== balanceOf(r)) return // changed meanwhile: tomorrow's run decides
      tx.update(d.ref, { balance: missed.balance, carryovers: missed.carryovers })
      for (const e of missed.entries) {
        tx.set(db.collection('transactions').doc(), {
          memberId: r.borrowerId, memberName: r.borrowerName, kind: 'note', amount: 0, carryover: true, loanId: d.id,
          // every entry keeps the loan as it was before this run, so voiding the group puts it back
          loanBefore: loanSnapshot(r), period: e.period, month: phMonth(now), cycle: phYear(now), createdAt: now,
          note: `Carryover (automatic): ${php(e.due)} interest due ${day(e.dueAt)} was not paid; balance now ${php(e.balance)}`,
        })
      }
    })
  }
})

const phDate = (ms: number) => new Date(ms + 8 * 3600_000)
const phMonth = (ms: number) => phDate(ms).getUTCMonth()
const phYear = (ms: number) => phDate(ms).getUTCFullYear()
