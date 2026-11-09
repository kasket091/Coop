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
