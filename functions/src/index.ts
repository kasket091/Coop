// Push notifications for loan requests. The functions only read and send (and drop dead phone tokens): they never
// write to loanRequests, so they can't trigger themselves.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
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

