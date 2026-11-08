import { expect, it } from 'vitest'
import { LOAN_CODE, monthInterest, nextRef, refLabel, savingsLoan, settleInterest, upfrontFix, type LoanRequest } from './requests'

it('every loan type has a 2-letter reference code', () => {
  expect(LOAN_CODE).toEqual({ flex: 'FL', savings: 'SL', regular: 'RL', grocery: 'GL', appliance: 'AL', events: 'HL', deposit: 'DL' })
})

it('references count per type, plus one running number across all loans', () => {
  expect(nextRef({}, 'savings')).toEqual({ ref: '1SL', no: 1, counters: { SL: 1, ALL: 1 } })
  expect(nextRef({ SL: 1, FL: 4, ALL: 11 }, 'savings')).toEqual({ ref: '2SL', no: 12, counters: { SL: 2, FL: 4, ALL: 12 } })
  expect(nextRef({ SL: 1, FL: 4, ALL: 13 }, 'flex')).toMatchObject({ ref: '5FL', no: 14 })
})

it('a loan reads as its type reference and running number', () => {
  expect(refLabel({ ref: '1SL', no: 12 })).toBe('1SL #12')
  expect(refLabel({ ref: '2FL' })).toBe('2FL')
  expect(refLabel({})).toBe('')
})

it('carried-over savings become an approved 10% loan with no co-maker', () => {
  const l = savingsLoan({ borrowerId: 'ma', borrowerName: 'Mark Anthony Ampo', amount: 6000, month: 6, ref: '1SL', now: 100 })
  expect(l).toMatchObject({
    type: 'savings', status: 'approved', amount: 6000, balance: 6600, principal: 6000, ref: '1SL', upfront: true,
    comakerIds: [], comakers: {}, carriedMonth: 6, decidedAt: 100, createdAt: 100,
  })
  // the 10% is added at once (₱6,600 owed); next month is charged on ₱6,600
  expect(monthInterest({ ...(l as LoanRequest), id: 'x' })).toBe(660)
  expect(settleInterest({ ...(l as LoanRequest), id: 'x' })).toBe(600)
})

it('an older Savings Loan without the upfront 10% gets it once', () => {
  const old = { ...(savingsLoan({ borrowerId: 'm', borrowerName: 'M', amount: 5500, month: 6, ref: '1SL', now: 1 }) as LoanRequest), id: 'x', balance: 5500, upfront: undefined }
  expect(upfrontFix(old)).toEqual({ balance: 6050, upfront: true, added: 550 })
  expect(upfrontFix({ ...old, upfront: true })).toBeNull()
  expect(upfrontFix({ ...old, type: 'flex' })).toBeNull()
})
