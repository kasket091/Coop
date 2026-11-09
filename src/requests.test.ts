import { describe, expect, it } from 'vitest'
import { depositAmount, type Member } from './rules'
import {
  canAdminApprove, carryover, comakerMode, customPayment, monthInterest, payInterest, requestStage, settleInterest, unpaidLoans, validateRequest, type LoanRequest,
} from './requests'

const zeros = () => Array(12).fill(0)
const borrower: Member = { id: 1, name: 'Aljem Aviola', heads: 12, paid: zeros(), interest: zeros() }
const founder: Member = { ...borrower, name: 'Chariz Parajes', founder: true }
const base = {
  borrower, borrowerId: 'me', recruiterId: 'f1', comakerIds: ['f1'], founderIds: ['f1', 'f2', 'f3', 'bryan'], bryanId: 'bryan',
  type: 'flex' as const, amount: 5000, months: 1, today: new Date(2026, 10, 8), year: 2026,
  hasPending: false, hasUnpaid: false, savings: 66000,
}

describe('co-maker rule', () => {
  it('a member within the limit needs their recruiter', () => expect(comakerMode({ borrower, amount: 5000, type: 'flex' })).toBe('recruiter'))
  it('a member over the limit is blocked', () => expect(comakerMode({ borrower, amount: 96001, type: 'flex' })).toBe('blocked'))
  it('a founder within the limit needs no co-maker', () => expect(comakerMode({ borrower: founder, amount: 96000, type: 'flex' })).toBe('none'))
  it('a founder over the limit needs 2 founders', () => expect(comakerMode({ borrower: founder, amount: 96001, type: 'flex' })).toBe('two-founders'))
  it('a loan against deposit needs no co-maker', () => expect(comakerMode({ borrower, amount: 52800, type: 'deposit' })).toBe('none'))
})

describe('validateRequest', () => {
  it('accepts a valid 1-month flex loan with the recruiter on 8 Nov 2026', () => expect(validateRequest(base)).toBeNull())
  it('the co-maker must be your recruiter', () => expect(validateRequest({ ...base, comakerIds: ['f2'] })).toMatch(/recruiter/))
  it('a member with no recruiter on record is told to ask the admin', () =>
    expect(validateRequest({ ...base, recruiterId: undefined, comakerIds: [] })).toMatch(/admin/))
  it('a recruiter missing from the board list is reported, not sent', () =>
    expect(validateRequest({ ...base, recruiterId: 'gone', comakerIds: ['gone'] })).toMatch(/not on record/))
  it('refuses a member over the loan limit', () => expect(validateRequest({ ...base, amount: 96001 })).toMatch(/limit/))
  it('a founder within the limit sends no co-maker', () =>
    expect(validateRequest({ ...base, borrower: founder, borrowerId: 'f3', comakerIds: [] })).toBeNull())
  it('a founder over the limit needs 2 different founders, not themselves, not Bryan', () => {
    const over = { ...base, borrower: founder, borrowerId: 'f3', amount: 100000, type: 'flex' as const }
    expect(validateRequest({ ...over, comakerIds: ['f1'] })).toMatch(/2 founding/)
    expect(validateRequest({ ...over, comakerIds: ['f1', 'f1'] })).toMatch(/different/)
    expect(validateRequest({ ...over, comakerIds: ['f1', 'f3'] })).toMatch(/yourself/)
    expect(validateRequest({ ...over, comakerIds: ['f1', 'bryan'] })).toMatch(/admin/)
    expect(validateRequest({ ...over, comakerIds: ['f1', 'x'] })).toMatch(/founding/)
    expect(validateRequest({ ...over, comakerIds: ['f1', 'f2'] })).toBeNull()
  })
  it('refuses a term longer than the months left', () => expect(validateRequest({ ...base, months: 2 })).toMatch(/December 15/))
  it('refuses a regular term that does not fit', () =>
    expect(validateRequest({ ...base, type: 'regular', amount: 20000, months: 2 })).toMatch(/December 15/))
  it('passes on handbook loan errors', () => expect(validateRequest({ ...base, type: 'grocery', amount: 1500 })).toMatch(/2,000/))
  it('refuses a second pending request', () => expect(validateRequest({ ...base, hasPending: true })).toMatch(/pending/))
})

describe('loan against deposit', () => {
  const dep = { ...base, type: 'deposit' as const, comakerIds: [], amount: 52800 }
  it('is 80% of savings rounded down to ₱100', () => {
    expect(depositAmount(66000)).toBe(52800)
    expect(depositAmount(11050)).toBe(8800)
    expect(depositAmount(0)).toBe(0)
  })
  it('accepts 80% of savings with no co-maker', () => expect(validateRequest(dep)).toBeNull())
  it('the amount is fixed at 80%', () => expect(validateRequest({ ...dep, amount: 50000 })).toMatch(/80%/))
  it('refuses a member with unpaid loans', () => expect(validateRequest({ ...dep, hasUnpaid: true })).toMatch(/unpaid/))
  it('charges 7% a month', () => expect(monthInterest({ ...req('approved', 'approved', 'approved'), type: 'deposit', amount: 52800 })).toBe(3696))
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
  it("a Savings Loan's 10% is always on the missed savings, never on the upfront or carried interest", () => {
    let r: LoanRequest = { ...flex(), type: 'savings', amount: 6000, principal: 6000, balance: 6600, upfront: true }
    expect(monthInterest(r)).toBe(600)
    r = { ...r, ...carryover(r) }; expect(r.balance).toBe(7200)
    expect(monthInterest(r)).toBe(600)
    r = { ...r, ...carryover(r) }; expect(r.balance).toBe(7800)
    expect(payInterest(r).collected).toBe(600)
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
  it('custom ₱500: interest first, the rest comes off the balance', () => {
    const p = customPayment(flex(), 500)
    expect(p).toMatchObject({ interestPart: 400, collected: 400, balance: 4900, principal: 4900, paidOff: false })
  })
  it('custom payment below the interest: the shortfall carries over', () => {
    expect(customPayment(flex(), 300)).toMatchObject({ interestPart: 300, collected: 300, balance: 5100, principal: 5000, paidOff: false })
  })
  it('custom payment repays carried-over interest before the amount borrowed', () => {
    // borrowed 5000, carried over once (balance 5400, interest now 432); paying 932 clears 432 + the 400 carried + 100
    expect(customPayment(flex(5400), 932)).toMatchObject({ collected: 832, balance: 4900, principal: 4900 })
  })
  it('paying everything owed closes the loan', () => {
    expect(customPayment(flex(), 5400)).toMatchObject({ balance: 0, paidOff: true, collected: 400 })
  })
  it('refuses nothing, or more than is owed', () => {
    expect(customPayment(flex(), 0)).toMatchObject({ error: expect.stringMatching(/amount/i) })
    expect(customPayment(flex(), 6000)).toMatchObject({ error: expect.stringContaining('5,400') })
  })
  it('settling a regular loan collects its flat interest', () => {
    expect(settleInterest({ ...flex(), type: 'regular', amount: 20000, months: 3 })).toBe(3300)
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
