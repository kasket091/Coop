import { expect, it } from 'vitest'
import { LOAN_CODE, loanMonth, monthInterest, nextRef, refLabel, savingsLoan, settleInterest, upfrontFix, type LoanRequest } from './requests'

it('every loan type has a 2-letter reference code', () => {
  expect(LOAN_CODE).toEqual({ flex: 'FL', savings: 'SL', regular: 'RL', grocery: 'GL', appliance: 'AL', events: 'HL', deposit: 'DL' })
})

it("references: the member's own loan count + type, and the coop-wide loan number", () => {
  expect(nextRef({}, 'savings', 'ma')).toEqual({ ref: '1SL', no: 1, counters: { ALL: 1, M_ma: 1 } })
  const c = { ALL: 13, M_ma: 12, M_ev: 1 }
  expect(nextRef(c, 'savings', 'ma')).toEqual({ ref: '13SL', no: 14, counters: { ALL: 14, M_ma: 13, M_ev: 1 } })
  expect(nextRef(c, 'flex', 'ev')).toMatchObject({ ref: '2FL', no: 14 })
})

it('a loan reads as its type reference and running number', () => {
  expect(refLabel({ ref: '1SL', no: 12 })).toBe('1SL #12')
  expect(refLabel({ ref: '2FL' })).toBe('2FL')
  expect(refLabel({})).toBe('')
})

it('carried-over savings become an approved 10% loan with no co-maker', () => {
  const l = savingsLoan({ borrowerId: 'ma', borrowerName: 'Mark Anthony Ampo', amount: 6000, month: 6, ref: '1SL', now: 100 })
  expect(l).toMatchObject({
    type: 'savings', status: 'approved', amount: 6000, balance: 6600, principal: 6000, ref: '1SL', upfront: true, compound: true,
    comakerIds: [], comakers: {}, carriedMonth: 6, decidedAt: 100, createdAt: 100,
  })
  // the 10% is added at once (₱6,600 owed); every month after is 10% of all that is owed
  expect(monthInterest({ ...(l as LoanRequest), id: 'x' })).toBe(660)
  expect(settleInterest({ ...(l as LoanRequest), id: 'x' })).toBe(600)
})

it('an older Savings Loan without the upfront 10% gets it once', () => {
  const old = { ...(savingsLoan({ borrowerId: 'm', borrowerName: 'M', amount: 5500, month: 6, ref: '1SL', now: 1 }) as LoanRequest), id: 'x', balance: 5500, upfront: undefined }
  expect(upfrontFix(old)).toEqual({ balance: 6050, upfront: true, added: 550 })
  expect(upfrontFix({ ...old, upfront: true })).toBeNull()
  expect(upfrontFix({ ...old, type: 'flex' })).toBeNull()
})

it('each loan names its month: savings loans the month they cover, others the month approved', () => {
  const base = { borrowerId: 'm', borrowerName: 'M', amount: 1, months: 1, quote: '', comakers: {}, comakerIds: [], createdAt: new Date(2026, 9, 20).getTime() }
  expect(loanMonth({ ...base, id: 'a', type: 'savings', status: 'approved', carriedMonth: 6 })).toBe('Jul savings')
  expect(loanMonth({ ...base, id: 'b', type: 'flex', status: 'paid', decidedAt: new Date(2026, 10, 3).getTime() })).toBe('Nov loan')
  expect(loanMonth({ ...base, id: 'c', type: 'flex', status: 'pending' })).toBe('Oct request')
})
