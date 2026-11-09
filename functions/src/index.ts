// Push notifications for loan requests. The functions only read and send (and drop dead phone tokens): they never
// write to loanRequests, so they can't trigger themselves.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import type { Txn } from '../../src/ledger'
import { balanceOf, carryover, interestDue, lastEndedPeriod, loanSnapshot, type LoanRequest } from '../../src/requests'
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
 * Every day at 12:05 AM (Philippine time): a loan whose interest due date ended yesterday and is still unpaid gets
 * that interest added to its balance, the same as the admin's Carryover button. The loan update then notifies the
 * borrower through loanRequestPush. Running twice adds nothing: a carried-over period has no interest left due.
 */
export const dailyInterestCarryover = onSchedule({ schedule: '5 0 * * *', timeZone: 'Asia/Manila' }, async () => {
  const db = getFirestore()
  const now = Date.now()
  const loans = await db.collection('loanRequests').where('status', '==', 'approved').get()
  for (const d of loans.docs) {
    const r = { ...(d.data() as LoanRequest), id: d.id }
    const p = lastEndedPeriod(r, now)
    if (!p) continue
    const txns = (await db.collection('transactions').where('loanId', '==', d.id).get()).docs.map((t) => ({ ...(t.data() as Txn), id: t.id }))
    const due = interestDue(r, txns, p.month, p.cycle)
    if (!(due > 0)) continue
    await db.runTransaction(async (tx) => {
      const live = { ...((await tx.get(d.ref)).data() as LoanRequest), id: d.id }
      if (live.status !== 'approved' || balanceOf(live) !== balanceOf(r)) return // changed meanwhile: tomorrow's run decides
      tx.update(d.ref, carryover(live, due))
      tx.set(db.collection('transactions').doc(), {
        memberId: live.borrowerId, memberName: live.borrowerName, kind: 'note', amount: 0, carryover: true, loanId: d.id,
        loanBefore: loanSnapshot(live), month: p.month, cycle: p.cycle, createdAt: now,
        note: `Carryover (automatic): ${php(due)} interest due ${day(p.dueAt)} was not paid; balance now ${php(balanceOf(live) + due)}`,
      })
    })
  }
})
