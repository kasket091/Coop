// Which push notifications a loan request change sends, and to whom. Pure: no Firebase, so it is tested on its own.

export type Req = {
  borrowerId: string; borrowerName: string; type: string; amount: number
  status: 'pending' | 'approved' | 'declined' | 'withdrawn' | 'paid'
  comakers: Record<string, { name: string; status: 'pending' | 'approved' | 'declined' }>
  comakerIds: string[]
  balance?: number; carryovers?: number; ref?: string; no?: number
}
/** `to` is a member's uid, or 'admin'. */
export type Message = { to: string; title: string; body: string }

const LOAN: Record<string, string> = {
  regular: 'Regular loan', flex: 'Flex loan', grocery: 'Grocery loan', appliance: 'Appliance loan',
  events: 'Special Events loan', deposit: 'Loan Against Deposit', savings: 'Savings Loan',
}
const peso = (n: number) => `₱${(Math.round(n * 100) / 100).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
const what = (r: Req) => `${peso(r.amount)} ${LOAN[r.type] ?? 'loan'}`
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
  // unpaid interest added to the balance (the daily carryover, or the admin's Carryover button)
  if (before.status === 'approved' && after.status === 'approved' && (after.carryovers ?? 0) > (before.carryovers ?? 0)) {
    const added = (after.balance ?? after.amount) - (before.balance ?? before.amount)
    const ref = after.ref ? `${after.ref}${after.no ? ` #${after.no}` : ''} ` : ''
    return [{ to: after.borrowerId, title: 'Interest added', body: `${peso(added)} unpaid interest was added to your ${ref}loan. You now owe ${peso(after.balance ?? after.amount)}.` }]
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

/** A member's payment sent for the admin to check (Pay Now on a loan, or Pay savings). */
export type PayReq = {
  memberId: string; memberName: string; kind: 'loan' | 'savings' | 'advance' | 'payoff'; loanLabel?: string; choice?: 'interest' | 'full' | 'custom'
  month?: number; advanceMonths?: number[]; payoffLoans?: { label: string }[]; amount: number; status: 'pending' | 'approved' | 'rejected'; reason?: string
}
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** The loan's reference alone ("3FL" from "3FL · Flex (8% a month)"), or the whole label without one. */
const ref = (p: PayReq) => (p.loanLabel ?? 'your loan').split(' · ')[0]
const refs = (p: PayReq) => (p.payoffLoans ?? []).map((x) => x.label.split(' · ')[0]).join(', ')

/** New → the admin; approved or rejected → the member. `before` is undefined for a new request. */
export function paymentMessagesFor(before: PayReq | undefined, after: PayReq): Message[] {
  if (!before) {
    if (after.status !== 'pending') return []
    const what = after.kind === 'savings' ? `for ${MONTH[after.month ?? 0]} savings`
      : after.kind === 'advance' ? `for ${(after.advanceMonths ?? []).map((i) => MONTH[i]).join(', ')} savings (advance)`
      : after.kind === 'payoff' ? `to pay off all loans (${refs(after)})`
      : after.choice === 'full' ? `to pay off ${ref(after)}` : after.choice === 'interest' ? `for ${ref(after)} interest` : `for ${ref(after)}`
    return [{ to: 'admin', title: 'Payment to check', body: `${after.memberName} sent ${peso(after.amount)} ${what}.` }]
  }
  if (before.status !== 'pending' || after.status === 'pending') return []
  const forWhat = after.kind === 'savings' ? `${MONTH[after.month ?? 0]} savings`
    : after.kind === 'advance' ? `${(after.advanceMonths ?? []).map((i) => MONTH[i]).join(', ')} savings`
    : after.kind === 'payoff' ? `all loans (${refs(after)})` : ref(after)
  return after.status === 'approved'
    ? [{ to: after.memberId, title: 'Payment recorded', body: `Your ${peso(after.amount)} payment for ${forWhat} was recorded.` }]
    : [{ to: after.memberId, title: 'Payment not accepted', body: `Your ${peso(after.amount)} payment for ${forWhat} wasn't accepted: ${after.reason ?? ''}.` }]
}
