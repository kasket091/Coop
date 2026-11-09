// Which push notifications a loan request change sends, and to whom. Pure: no Firebase, so it is tested on its own.

export type Req = {
  borrowerId: string; borrowerName: string; type: string; amount: number
  status: 'pending' | 'approved' | 'declined' | 'withdrawn' | 'paid'
  comakers: Record<string, { name: string; status: 'pending' | 'approved' | 'declined' }>
  comakerIds: string[]
}
/** `to` is a member's uid, or 'admin'. */
export type Message = { to: string; title: string; body: string }

const LOAN: Record<string, string> = {
  regular: 'Regular loan', flex: 'Flex loan', grocery: 'Grocery loan', appliance: 'Appliance loan',
  events: 'Special Events loan', deposit: 'Loan Against Deposit', savings: 'Savings Loan',
}
const what = (r: Req) => `₱${r.amount.toLocaleString('en-PH', { maximumFractionDigits: 2 })} ${LOAN[r.type] ?? 'loan'}`
const allApproved = (r: Req) => r.comakerIds.length > 0 && r.comakerIds.every((id) => r.comakers[id]?.status === 'approved')

/** `before` is undefined for a new request. Payments, withdrawals and other edits send nothing. */
export function messagesFor(before: Req | undefined, after: Req): Message[] {
  if (!before) {
    if (after.status !== 'pending') return [] // e.g. a Savings Loan the admin created already approved
    if (!after.comakerIds.length) return [{ to: 'admin', title: 'Loan ready to approve', body: `${after.borrowerName} requested a ${what(after)}. No co-maker needed.` }]
    const n = after.comakerIds.length
    return [
      ...after.comakerIds.map((id) => ({ to: id, title: 'Co-maker request', body: `${after.borrowerName} asked you to co-make a ${what(after)}. Open Hilas Coop to approve or decline.` })),
      { to: 'admin', title: 'New loan request', body: `${after.borrowerName} requested a ${what(after)}. Waiting for ${n} co-maker${n === 1 ? '' : 's'}.` },
    ]
  }
  if (before.status !== 'pending') return []
  if (after.status === 'approved') return [{ to: after.borrowerId, title: 'Loan approved', body: `Your ${what(after)} was approved.` }]
  if (after.status === 'declined') {
    const decliner = after.comakerIds.find((id) => after.comakers[id]?.status === 'declined' && before.comakers[id]?.status !== 'declined')
    return [{
      to: after.borrowerId, title: 'Loan request declined',
      body: decliner ? `${after.comakers[decliner].name} declined to co-make your ${what(after)}.` : `Your ${what(after)} request was declined by the admin.`,
    }]
  }
  if (after.status === 'pending' && allApproved(after) && !allApproved(before))
    return [{ to: 'admin', title: 'Loan ready to approve', body: `${after.borrowerName}'s ${what(after)} has every co-maker's approval.` }]
  return []
}
