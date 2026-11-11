import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { LoansTab } from './member-tabs'
import { MyPayments, PayLoanDialog, PaySavingsButton } from './pay-dialogs'
import type { PaymentRequest } from './payments'
import type { LoanRequest } from './requests'
import type { StoredMember } from './store'

const me = { uid: 'me', name: 'Ana Reyes', heads: 2, paid: Array(12).fill(0), interest: Array(12).fill(0), createdAt: 1 } as unknown as StoredMember
const loan = { id: 'l', borrowerId: 'me', borrowerName: 'Ana Reyes', type: 'flex', amount: 5000, balance: 5000, months: 1, quote: '', comakers: {}, comakerIds: [], status: 'approved', createdAt: Date.now(), decidedAt: Date.now(), ref: '3FL' } as LoanRequest
afterEach(() => vi.useRealTimers())

it('Pay Now on a loan: Interest, Full payment and Custom Payment, the screenshot field and the BPI, GCash and Maya numbers', () => {
  const page = renderToStaticMarkup(<PayLoanDialog me={me} loan={loan} loans={[loan]} txns={[]} onClose={() => {}} />)
  expect(page).toContain('Pay 3FL · Flex (8% a month)')
  expect(page).toContain('Interest · ₱400')
  expect(page).toContain('Full payment · ₱5,000')
  expect(page).toContain('Custom Payment')
  expect(page).toContain('Screenshot of your payment')
  for (const n of ['9336367402', '09499974143']) expect(page).toContain(n)
  expect(page).not.toContain('Victors Subdivision') // no Cash row
})

it("a terminated member's loans have no Pay Now on them", () => {
  const page = renderToStaticMarkup(<LoansTab me={{ ...me, terminated: { at: 1, reason: 'x' } } as StoredMember} year={2026} mine={[loan]} txns={[]} payments={[]} onPay={() => {}} />)
  expect(page.match(/Pay Now/g)).toHaveLength(1) // only the one under the total, which opens Pay & Rules
})

it('Pay savings: open through the 7th, closed from the 8th, gone once the month is paid or a payment is waiting', () => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.UTC(2026, 10, 7, 4)) // Nov 7, noon in Manila
  expect(renderToStaticMarkup(<PaySavingsButton me={me} year={2026} waiting={[]} />)).toContain('Pay savings')
  vi.setSystemTime(Date.UTC(2026, 10, 8, 4))
  const closed = renderToStaticMarkup(<PaySavingsButton me={me} year={2026} waiting={[]} />)
  expect(closed).toContain('disabled')
  expect(closed).toContain('Savings for November closed on the 7th. Message the admin.')
  const paid = { ...me, paid: Array(12).fill(1000) } as StoredMember
  expect(renderToStaticMarkup(<PaySavingsButton me={paid} year={2026} waiting={[]} />)).toBe('')
  const waiting = [{ id: 'p', memberId: 'me', memberName: 'Ana', kind: 'savings', month: 10, amount: 1000, createdAt: 1, status: 'pending' }] as PaymentRequest[]
  expect(renderToStaticMarkup(<PaySavingsButton me={me} year={2026} waiting={waiting} />)).toContain('waiting for the admin')
})

it('Payments sent: waiting ones with Withdraw, rejected ones with the reason', () => {
  const p = (over: Partial<PaymentRequest>) => ({ id: 'p', memberId: 'me', memberName: 'Ana', kind: 'loan', loanLabel: '3FL · Flex', amount: 500, createdAt: Date.now(), status: 'pending', ...over }) as PaymentRequest
  const page = renderToStaticMarkup(<MyPayments list={[p({}), p({ id: 'q', status: 'rejected', decidedAt: Date.now(), reason: 'wrong amount' })]} onWithdraw={() => {}} />)
  expect(page).toContain('Withdraw')
  expect(page).toContain('Not accepted: wrong amount')
  expect(renderToStaticMarkup(<MyPayments list={[p({ status: 'approved' })]} onWithdraw={() => {}} />)).toBe('')
})
