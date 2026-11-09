import { expect, it } from 'vitest'
import { feeTopUps, payFromSavings, terminationFlag, terminationPayout } from './termination'

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

it('termination pays unpaid loans from savings, oldest first; the sheet balance last', () => {
  const plan = payFromSavings([{ id: 'a', balance: 6600 }, { id: 'b', balance: 20000 }], 5000, 52800)
  expect(plan).toEqual({ payments: [{ id: 'a', amount: 6600, full: true }, { id: 'b', amount: 20000, full: true }], sheetPaid: 5000, payout: 21200, stillOwed: 0 })
})
it('when savings run out, the last loan is part-paid and the rest is still owed', () => {
  const plan = payFromSavings([{ id: 'a', balance: 6600 }, { id: 'b', balance: 20000 }], 5000, 8000)
  expect(plan).toEqual({ payments: [{ id: 'a', amount: 6600, full: true }, { id: 'b', amount: 1400, full: false }], sheetPaid: 0, payout: 0, stillOwed: 23600 })
})

it('fee top-up: an account terminated before Savings Loans counted gets the rest of the 20%, once', () => {
  const fee = (amount: number, over = {}) => ({ id: 'f', memberId: 'a', memberName: 'A', kind: 'interest' as const, amount, month: 10, cycle: 2026, note: 'Termination fee: 20% of ₱18,000 savings', createdAt: 1, ...over })
  const a = { uid: 'a', terminated: { at: 1 }, paid: paid(4) } // 24,000 saved now (18,000 + 6,000 SL paid off)
  expect(feeTopUps([a], [fee(3600)], 2026)).toEqual([{ uid: 'a', add: 1200, month: 10, saved: 24000, fee: 4800 }])
  // already topped up, voided fees, other members and other cycles
  expect(feeTopUps([a], [fee(3600), fee(1200, { id: 'g', note: 'Termination fee top-up' })], 2026)).toEqual([])
  expect(feeTopUps([a], [fee(4800, { voidedAt: 2 })], 2026)).toEqual([])
  expect(feeTopUps([{ ...a, terminated: undefined }], [fee(3600)], 2026)).toEqual([])
  expect(feeTopUps([a], [fee(3600, { cycle: 2025 })], 2026)).toEqual([])
})
