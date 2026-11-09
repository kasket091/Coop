import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LoansTab } from './member-tabs'
import type { LoanRequest } from './requests'
import type { StoredMember } from './store'

const me = { uid: 'me', name: 'Ana Reyes', heads: 2, paid: Array(12).fill(0), interest: Array(12).fill(0), createdAt: 1 } as unknown as StoredMember
const loan = { id: 'l', borrowerId: 'me', borrowerName: 'Ana Reyes', type: 'flex', amount: 5000, months: 1, quote: '', comakers: {}, comakerIds: [], status: 'approved', createdAt: 1, decidedAt: 1 } as LoanRequest
const html = (mine: LoanRequest[]) => renderToStaticMarkup(<LoansTab me={me} year={2026} mine={mine} txns={[]} onPay={() => {}} />)

it('Pay Now shows only when the member owes something', () => {
  // under the total, and on each active loan
  expect(html([loan]).match(/Pay Now/g)).toHaveLength(2)
  expect(html([loan, { ...loan, id: 'l2' }]).match(/Pay Now/g)).toHaveLength(3)
  expect(html([])).not.toContain('Pay Now')
})

it('payment transactions: the newest 5, with Show all for the rest', () => {
  const t = (i: number) => ({ id: `t${i}`, memberId: 'me', memberName: 'Ana Reyes', kind: 'savings' as const, amount: 1000, month: 0, cycle: 2026, note: `entry ${i}`, createdAt: 100 - i })
  const page = (n: number) => renderToStaticMarkup(<LoansTab me={me} year={2026} mine={[]} txns={Array.from({ length: n }, (_, i) => t(i))} onPay={() => {}} />)
  expect(page(7)).toContain('Show all (7)')
  expect(page(7)).toContain('entry 4')
  expect(page(7)).not.toContain('entry 5')
  expect(page(5)).not.toContain('Show all')
})
