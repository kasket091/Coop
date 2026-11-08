import { describe, expect, it } from 'vitest'
import type { Member } from './rules'
import {
  canAdminApprove, carryover, monthInterest, payInterest, requestStage, settleInterest, unpaidLoans, validateRequest, type LoanRequest,
} from './requests'

const zeros = () => Array(12).fill(0)
const borrower: Member = { id: 1, name: 'Aljem Aviola', heads: 12, paid: zeros(), interest: zeros() }
const base = {
  borrower, comakerIds: ['f1', 'f2'], founderIds: ['f1', 'f2', 'f3'], type: 'flex' as const,
  amount: 5000, months: 1, today: new Date(2026, 10, 8), year: 2026, hasPending: false, borrowerId: 'me',
}

describe('validateRequest', () => {
  it('accepts a valid 1-month flex loan on 8 Nov 2026', () => expect(validateRequest(base)).toBeNull())
  it('needs exactly two co-makers', () => expect(validateRequest({ ...base, comakerIds: ['f1'] })).toMatch(/2 co-makers/))
  it('refuses the same co-maker twice', () => expect(validateRequest({ ...base, comakerIds: ['f1', 'f1'] })).toMatch(/different/))
  it('refuses a non-founder co-maker', () => expect(validateRequest({ ...base, comakerIds: ['f1', 'x'] })).toMatch(/founding/))
  it('refuses yourself as co-maker', () =>
    expect(validateRequest({ ...base, borrowerId: 'f1', founderIds: ['f1', 'f2'] })).toMatch(/yourself/))
  it('refuses more than the loan limit', () => expect(validateRequest({ ...base, amount: 96001 })).toMatch(/limit/))
  it('refuses a term longer than the months left', () => expect(validateRequest({ ...base, months: 2 })).toMatch(/December 15/))
  it('refuses a regular term that does not fit', () =>
    expect(validateRequest({ ...base, type: 'regular', amount: 20000, months: 2 })).toMatch(/December 15/))
  it('passes on handbook loan errors', () => expect(validateRequest({ ...base, type: 'grocery', amount: 1500 })).toMatch(/2,000/))
  it('refuses a second pending request', () => expect(validateRequest({ ...base, hasPending: true })).toMatch(/pending/))
})

const req = (a: string, b: string, status: LoanRequest['status'] = 'pending'): LoanRequest => ({
  id: 'r', borrowerId: 'me', borrowerName: 'Aljem Aviola', type: 'flex', amount: 5000, months: 1, quote: '',
  comakers: { f1: { name: 'A', status: a as never }, f2: { name: 'B', status: b as never } }, comakerIds: ['f1', 'f2'],
  status, createdAt: 0,
})

describe('unpaid loans', () => {
  const loan = (id: string, borrowerId: string, amount: number, status: LoanRequest['status']): LoanRequest =>
    ({ ...req('approved', 'approved', status), id, borrowerId, amount })
  const all = [loan('a', 'me', 5000, 'approved'), loan('b', 'me', 3000, 'paid'), loan('c', 'me', 2000, 'pending'),
    loan('d', 'other', 9000, 'approved'), loan('e', 'me', 1000, 'declined')]
  it('counts approved, not-yet-paid app loans plus the typed sheet balance', () => {
    const u = unpaidLoans(all, 'me', 12500)
    expect(u.loans.map((l) => l.id)).toEqual(['a'])
    expect(u.appTotal).toBe(5000)
    expect(u.total).toBe(17500)
  })
  it('a missing sheet balance counts as zero', () => expect(unpaidLoans(all, 'me').total).toBe(5000))
  it('a paid loan reads as Paid', () => expect(requestStage(loan('b', 'me', 3000, 'paid'))).toBe('Paid'))
})

describe('pay interest and carryover (handbook p.8)', () => {
  const flex = (balance?: number): LoanRequest => ({ ...req('approved', 'approved', 'approved'), type: 'flex', amount: 5000, balance })
  it("this month's interest is the rate on the current balance", () => {
    expect(monthInterest(flex())).toBe(400)
    expect(monthInterest({ ...flex(), type: 'grocery' })).toBe(250)
  })
  it('carryover adds the interest to the balance, compounding month after month', () => {
    let r = flex()
    r = { ...r, ...carryover(r) }; expect(r.balance).toBe(5400)
    r = { ...r, ...carryover(r) }; expect(r.balance).toBe(5832)
    r = { ...r, ...carryover(r) }; expect(r.balance).toBe(6298.56)
    expect(r.carryovers).toBe(3)
  })
  it('paying interest keeps the balance and reports the interest collected', () => {
    const r = flex(5400)
    const p = payInterest(r)
    expect(p.collected).toBe(432)
    expect(p.update.balance).toBe(5400)
    expect(p.update.interestPayments).toBe(1)
  })
  it('settling a carried-over loan collects the carried interest', () => {
    expect(settleInterest(flex(5832))).toBe(832)
    expect(settleInterest(flex())).toBe(0)
  })
  it('unpaid loans count the current balance, not the original amount', () => {
    expect(unpaidLoans([{ ...flex(5832), borrowerId: 'me' }], 'me').total).toBe(5832)
  })
  it('regular (flat) loans have no monthly carryover', () => {
    expect(monthInterest({ ...flex(), type: 'regular' })).toBe(0)
  })
})

describe('approval flow', () => {
  it('admin can approve only when both co-makers approved', () => {
    expect(canAdminApprove(req('approved', 'pending'))).toBe(false)
    expect(canAdminApprove(req('approved', 'declined'))).toBe(false)
    expect(canAdminApprove(req('approved', 'approved'))).toBe(true)
    expect(canAdminApprove(req('approved', 'approved', 'approved'))).toBe(false)
  })
  it('names the stage', () => {
    expect(requestStage(req('approved', 'pending'))).toBe('Waiting for co-makers')
    expect(requestStage(req('approved', 'approved'))).toBe('Waiting for admin')
    expect(requestStage(req('approved', 'approved', 'approved'))).toBe('Approved')
    expect(requestStage(req('declined', 'pending', 'declined'))).toBe('Declined')
    expect(requestStage(req('pending', 'pending', 'withdrawn'))).toBe('Withdrawn')
  })
})
