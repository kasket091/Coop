import { describe, expect, it } from 'vitest'
import { messagesFor, paymentMessagesFor, type PayReq, type Req } from './messages'

const req = (over: Partial<Req> = {}): Req => ({
  borrowerId: 'b', borrowerName: 'Juan Dela Cruz', type: 'flex', amount: 5000, status: 'pending',
  comakers: { c1: { name: 'Ana Reyes', status: 'pending' } }, comakerIds: ['c1'], ...over,
})

it('a new request: each co-maker is asked, the admin hears of it', () => {
  expect(messagesFor(undefined, req())).toEqual([
    { to: 'c1', title: 'Co-maker request', body: 'Juan Dela Cruz asked you to co-make a ₱5,000 Flex loan. Open Hilas Coop to approve or decline.' },
    { to: 'admin', title: 'New loan request', body: 'Juan Dela Cruz requested a ₱5,000 Flex loan. Waiting for 1 co-maker.' },
  ])
})

it('a new request that needs no co-maker is ready for the admin at once', () => {
  expect(messagesFor(undefined, req({ type: 'deposit', comakers: {}, comakerIds: [] }))).toEqual([
    { to: 'admin', title: 'Loan ready to approve', body: 'Juan Dela Cruz requested a ₱5,000 Loan Against Deposit. No co-maker needed.' },
  ])
})

it('Savings Loans the admin creates (already approved) send nothing', () => {
  expect(messagesFor(undefined, req({ type: 'savings', status: 'approved', comakers: {}, comakerIds: [] }))).toEqual([])
})

it('the last co-maker approving: the admin can approve', () => {
  const before = req({ comakers: { c1: { name: 'Ana Reyes', status: 'approved' }, c2: { name: 'Leo Cruz', status: 'pending' } }, comakerIds: ['c1', 'c2'] })
  const after = req({ comakers: { c1: { name: 'Ana Reyes', status: 'approved' }, c2: { name: 'Leo Cruz', status: 'approved' } }, comakerIds: ['c1', 'c2'] })
  expect(messagesFor(before, after)).toEqual([{ to: 'admin', title: 'Loan ready to approve', body: "Juan Dela Cruz's ₱5,000 Flex loan has every co-maker's approval." }])
  // one of two approving is not news yet
  expect(messagesFor(req({ comakers: { c1: { name: 'Ana Reyes', status: 'pending' }, c2: { name: 'Leo Cruz', status: 'pending' } }, comakerIds: ['c1', 'c2'] }), before)).toEqual([])
})

it('a co-maker declining tells the borrower who declined', () => {
  const after = req({ status: 'declined', comakers: { c1: { name: 'Ana Reyes', status: 'declined' } } })
  expect(messagesFor(req(), after)).toEqual([{ to: 'b', title: 'Loan request declined', body: 'Ana Reyes declined to co-make your ₱5,000 Flex loan.' }])
})

it('the admin deciding tells the borrower', () => {
  expect(messagesFor(req(), req({ status: 'approved' }))).toEqual([{ to: 'b', title: 'Loan approved', body: 'Your ₱5,000 Flex loan was approved.' }])
  expect(messagesFor(req(), req({ status: 'declined' }))).toEqual([{ to: 'b', title: 'Loan request declined', body: 'Your ₱5,000 Flex loan request was declined by the admin.' }])
})

it('payments, withdrawals and other edits send nothing', () => {
  expect(messagesFor(req({ status: 'approved' }), req({ status: 'approved', balance: 4000 } as Partial<Req>))).toEqual([])
  expect(messagesFor(req(), req({ status: 'withdrawn' }))).toEqual([])
  expect(messagesFor(req({ status: 'approved' }), req({ status: 'paid' }))).toEqual([])
})

it('interest added to a loan (automatic or the Carryover button) tells the borrower', () => {
  const before = req({ status: 'approved', balance: 6600, carryovers: 0, ref: '4SL', no: 18, type: 'savings', amount: 6000 })
  const after = { ...before, balance: 7200, carryovers: 1 }
  expect(messagesFor(before, after)).toEqual([{ to: 'b', title: 'Interest added', body: '₱600 unpaid interest was added to your 4SL #18 loan. You now owe ₱7,200.' }])
  // a payment (balance down, no new carryover) sends nothing
  expect(messagesFor(after, { ...after, balance: 6600 })).toEqual([])
})

describe('payment requests', () => {
  const pay = (over: Partial<PayReq> = {}): PayReq => ({ memberId: 'm', memberName: 'Ana Reyes', kind: 'loan', loanLabel: '3FL · Flex (8% a month)', choice: 'interest', amount: 500, status: 'pending', ...over })
  it('a new one tells the admin what to check', () => {
    expect(paymentMessagesFor(undefined, pay())).toEqual([{ to: 'admin', title: 'Payment to check', body: 'Ana Reyes sent ₱500 for 3FL interest.' }])
    expect(paymentMessagesFor(undefined, pay({ choice: 'full', amount: 5000 }))[0].body).toBe('Ana Reyes sent ₱5,000 to pay off 3FL.')
    expect(paymentMessagesFor(undefined, pay({ choice: 'custom' }))[0].body).toBe('Ana Reyes sent ₱500 for 3FL.')
    expect(paymentMessagesFor(undefined, pay({ kind: 'savings', month: 10, choice: undefined, loanLabel: undefined }))[0].body).toBe('Ana Reyes sent ₱500 for November savings.')
  })
  it('approved or rejected tells the member', () => {
    expect(paymentMessagesFor(pay(), pay({ status: 'approved' }))).toEqual([{ to: 'm', title: 'Payment recorded', body: 'Your ₱500 payment for 3FL was recorded.' }])
    expect(paymentMessagesFor(pay(), pay({ status: 'rejected', reason: 'wrong amount' }))).toEqual([{ to: 'm', title: 'Payment not accepted', body: "Your ₱500 payment for 3FL wasn't accepted: wrong amount." }])
  })
  it('advance savings name every month paid ahead', () => {
    const adv = pay({ kind: 'advance', advanceMonths: [10, 11], choice: undefined, loanLabel: undefined, amount: 2000 })
    expect(paymentMessagesFor(undefined, adv)[0].body).toBe('Ana Reyes sent ₱2,000 for November, December savings (advance).')
    expect(paymentMessagesFor(adv, { ...adv, status: 'approved' })[0].body).toBe('Your ₱2,000 payment for November, December savings was recorded.')
  })
  it('paying off all loans names each loan', () => {
    const all = pay({ kind: 'payoff', payoffLoans: [{ label: '3FL · Flex' }, { label: '5SL · Savings Loan' }], choice: undefined, loanLabel: undefined, amount: 12400 })
    expect(paymentMessagesFor(undefined, all)[0].body).toBe('Ana Reyes sent ₱12,400 to pay off all loans (3FL, 5SL).')
    expect(paymentMessagesFor(all, { ...all, status: 'approved' })[0].body).toBe('Your ₱12,400 payment for all loans (3FL, 5SL) was recorded.')
  })
  it('anything else sends nothing', () => {
    expect(paymentMessagesFor(pay({ status: 'approved' }), pay({ status: 'approved' }))).toEqual([])
  })
})
