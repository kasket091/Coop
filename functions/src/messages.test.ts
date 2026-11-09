import { expect, it } from 'vitest'
import { messagesFor, type Req } from './messages'

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
