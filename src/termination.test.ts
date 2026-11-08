import { expect, it } from 'vitest'
import { terminationFlag, terminationPayout } from './termination'

const paid = (n: number) => Array(12).fill(6000).map((v, i) => (i < n ? v : 0))

it('flags 3 carryover months in a row, then a 4th month unpaid', () => {
  // Jul, Aug, Sep carried over; Oct missed; it is now Nov 8 (Jan–Oct closed)
  const p = paid(12); p[9] = 0
  expect(terminationFlag(new Set([6, 7, 8]), p, 6000, 10)).toEqual({ months: [6, 7, 8], fourth: 9 })
})
it('a 4th carryover month also counts as not paying', () => {
  expect(terminationFlag(new Set([6, 7, 8, 9]), paid(12), 6000, 10)?.fourth).toBe(9)
})
it('not flagged when the 4th month was paid', () => {
  expect(terminationFlag(new Set([6, 7, 8]), paid(12), 6000, 10)).toBeNull()
})
it('not flagged when the carryovers are not in a row', () => {
  const p = paid(12); p[9] = 0
  expect(terminationFlag(new Set([4, 6, 8]), p, 6000, 10)).toBeNull()
})
it('not flagged before the 4th month has closed', () => {
  expect(terminationFlag(new Set([6, 7, 8]), paid(9), 6000, 9)).toBeNull()
})

it('termination payout: savings less 20%, less unpaid loans', () => {
  expect(terminationPayout(66000, 20000)).toEqual({ saved: 66000, fee: 13200, afterFee: 52800, loansDeducted: 20000, payout: 32800, stillOwed: 0 })
})
it('loans larger than what is left: nothing paid out, the rest still owed', () => {
  expect(terminationPayout(10000, 9000)).toEqual({ saved: 10000, fee: 2000, afterFee: 8000, loansDeducted: 8000, payout: 0, stillOwed: 1000 })
})
