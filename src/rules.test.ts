import { describe, expect, it } from 'vitest'
import {
  closedMonths, coopSummary, loanLimit, memberSummary, minAnnualLoan, missedMonths,
  missedOwed, monthlyDue, monthlyLoan, monthlyLoanError, monthsLeft, regularLoan, regularTerms, type Member,
} from './rules'

const zeros = () => Array(12).fill(0)
const member = (name: string, heads: number, interestTotal = 0, paid = zeros()): Member => {
  const interest = zeros()
  interest[0] = interestTotal
  return { id: 1, name, heads, paid, interest }
}

describe('heads', () => {
  it('monthly due is ₱500 per head', () => expect(monthlyDue(12)).toBe(6000))
  it('loan limit is heads × 8000 (handbook p.5)', () => {
    expect(loanLimit(2)).toBe(16000)
    expect(loanLimit(12)).toBe(96000)
  })
  it('minimum annual loan follows head tiers', () => {
    expect(minAnnualLoan(4)).toBe(10000)
    expect(minAnnualLoan(5)).toBe(20000)
    expect(minAnnualLoan(7)).toBe(20000)
    expect(minAnnualLoan(8)).toBe(30000)
    expect(minAnnualLoan(14)).toBe(30000)
  })
})

describe('deadlines', () => {
  it('a month closes after the 7th', () => {
    expect(closedMonths(new Date(2026, 10, 8))).toBe(11)
    expect(closedMonths(new Date(2026, 10, 7))).toBe(10)
  })
  it('clamps to the 2026 cycle', () => {
    expect(closedMonths(new Date(2025, 11, 31))).toBe(0)
    expect(closedMonths(new Date(2027, 0, 1))).toBe(12)
  })
  it('lists closed months paid short', () => {
    const paid = zeros(); paid[0] = 1000; paid[2] = 1000
    expect(missedMonths(member('A', 2, 0, paid), new Date(2026, 2, 8))).toEqual([1])
  })
  it('missed contributions compound at 10% a month', () => {
    expect(missedOwed(5000, 1)).toBe(5500)
    expect(missedOwed(5000, 3)).toBe(6655)
  })
})

describe('cycle-aware months', () => {
  it('months left must end by December 15', () => {
    expect(monthsLeft(new Date(2026, 10, 8))).toBe(1)
    expect(monthsLeft(new Date(2026, 10, 20))).toBe(0)
    expect(monthsLeft(new Date(2026, 2, 3))).toBe(9)
    expect(monthsLeft(new Date(2026, 11, 16))).toBe(0)
  })
  it('before the cycle counts from January 1; after it nothing is left', () => {
    expect(monthsLeft(new Date(2025, 5, 1), 2026)).toBe(11)
    expect(monthsLeft(new Date(2027, 0, 5), 2026)).toBe(0)
  })
  it('regular terms are the 2/3/6 that fit', () => {
    expect(regularTerms(1)).toEqual([])
    expect(regularTerms(3)).toEqual([2, 3])
    expect(regularTerms(9)).toEqual([2, 3, 6])
  })
  it('deadlines follow the cycle year', () => {
    expect(closedMonths(new Date(2027, 0, 9), 2027)).toBe(1)
  })
})

describe('dividends', () => {
  const members = [member('A', 12, 49158.83), member('B', 2, 1000)]
  it('top borrower gets 3% of their interest back', () => {
    const c = coopSummary(members)
    expect(c.top?.name).toBe('A')
    expect(c.top?.rebate).toBeCloseTo(1474.76, 2)
  })
  it('dividend per head = (interest − rebate) / heads', () => {
    expect(coopSummary(members).dividendPerHead).toBeCloseTo((50158.83 - 1474.7649) / 14, 2)
  })
  it('a terminated top borrower is skipped: the next highest gets the 3%', () => {
    const c = coopSummary([{ ...member('A', 12, 49158.83), terminated: { at: 1, reason: 'x' } }, member('B', 2, 1000)])
    expect(c.top?.name).toBe('B')
    expect(c.top?.rebate).toBeCloseTo(30, 2)
    // A's interest still counts in the pool
    expect(c.totalInterest).toBeCloseTo(50158.83, 2)
  })
  it("a terminated member's heads leave the dividend; their interest stays in the pool", () => {
    const c = coopSummary([{ ...member('A', 12, 1000), terminated: { at: 1, reason: 'x' } }, member('B', 2, 2000), member('C', 2)])
    expect(c.totalHeads).toBe(4)
    // pool 3000 − 3% of B's 2000 (60) = 2940, over the 4 active heads
    expect(c.dividendPerHead).toBeCloseTo(2940 / 4, 2)
  })
  it('no interest means no top borrower', () => {
    const c = coopSummary([member('A', 2)])
    expect(c.top).toBeNull()
    expect(c.dividendPerHead).toBe(0)
  })
  it('payout = year target + dividend + own rebate', () => {
    const c = coopSummary(members)
    const s = memberSummary(members[0], c, new Date(2026, 0, 1))
    expect(s.target).toBe(72000)
    expect(s.payout).toBeCloseTo(72000 + 12 * c.dividendPerHead + c.top!.rebate, 2)
    expect(memberSummary(members[1], c, new Date(2026, 0, 1)).rebate).toBe(0)
  })
})

describe('loans', () => {
  it('regular 3 months at 5.5% flat (handbook p.9 loan #001)', () => {
    expect(regularLoan(50000, 3)).toEqual({ rate: 0.055, interest: 8250, installment: 19416.67, total: 58250 })
  })
  it('regular 6 months at 5%', () => {
    expect(regularLoan(75000, 6)).toMatchObject({ interest: 22500 })
  })
  it('rejects amounts outside the regular range', () => {
    expect(regularLoan(9000, 3)).toMatchObject({ error: expect.stringContaining('Flex') })
    expect(regularLoan(15000, 6)).toHaveProperty('error')
    expect(regularLoan(60000, 2)).toHaveProperty('error')
  })
  it('grocery loans start at ₱2,000 (handbook p.7)', () => {
    expect(monthlyLoanError('grocery', 1500, 2)).toMatch(/2,000/)
    expect(monthlyLoanError('grocery', 2000, 1)).toBeNull()
  })
  it('appliance loans run at least 2 months (handbook p.7)', () => {
    expect(monthlyLoanError('appliance', 10000, 1)).toMatch(/2 months/)
    expect(monthlyLoanError('appliance', 10000, 2)).toBeNull()
  })
  it('any monthly-rate loan needs an amount', () => {
    expect(monthlyLoanError('flex', 0, 1)).toMatch(/amount/i)
  })
  it('monthly-rate loans: interest paid monthly vs capitalized (handbook p.8)', () => {
    expect(monthlyLoan(5000, 0.08, 3)).toEqual({ paidMonthly: 1200, unpaid: 1298.56 })
  })
})
