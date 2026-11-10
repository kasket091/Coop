import { describe, expect, it } from 'vitest'
import { depositAmount, type Member } from './rules'
import type { Txn } from './ledger'
import {
  canAdminApprove, carryover, compoundFix, replayLoan, waivedDue, comakerMode, customPayment, endedPeriods, interestDue, loanDeadline, loanPeriod, missedInterest, loanSnapshot, monthInterest, payInterest, savingsPayback, requestStage, settleInterest, unpaidLoans, validateRequest, type LoanRequest,
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
  it("a Savings Loan's 10% is on the full balance: ₱6,600, ₱7,260, ₱7,986, ₱8,784.60, ₱9,663.06", () => {
    let r: LoanRequest = { ...flex(), type: 'savings', amount: 6000, principal: 6000, balance: 6600, upfront: true }
    expect(monthInterest(r)).toBe(660)
    for (const b of [7260, 7986, 8784.6, 9663.06]) { r = { ...r, ...carryover(r) }; expect(r.balance).toBe(b) }
  })
  it("Pay interest on a Savings Loan takes off last month's 10%: ₱7,260 → ₱6,600 → ₱6,000", () => {
    const r: LoanRequest = { ...flex(), type: 'savings', amount: 6000, principal: 6000, balance: 7260, upfront: true }
    expect(payInterest(r, 0)).toMatchObject({ collected: 660, update: { balance: 6600 } })
    expect(payInterest({ ...r, balance: 6600 }, 0)).toMatchObject({ collected: 600, update: { balance: 6000 } })
    expect(payInterest({ ...r, balance: 9663.06 }, 0)).toMatchObject({ collected: 878.46, update: { balance: 8784.6 } })
  })
  it('one-time recalculation of a Savings Loan whose months were added at 10% of the missed savings', () => {
    const old: LoanRequest = { ...flex(), type: 'savings', amount: 6000, principal: 6000, balance: 9000, carryovers: 4, upfront: true }
    expect(compoundFix(old)).toEqual({ balance: 9663.06, added: 663.06 })
    expect(compoundFix({ ...old, balance: 6600, carryovers: 0 })).toEqual({ balance: 6600, added: 0 })
    expect(compoundFix({ ...old, compound: true })).toBeNull()
    expect(compoundFix({ ...old, principal: 0, balance: 2400 })).toBeNull() // savings paid back: nothing grows any more
    expect(compoundFix({ ...old, type: 'flex' })).toBeNull()
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

describe("a period's interest due (in the unpaid total until paid)", () => {
  // a Flex loan of ₱7,500 at 8%: ₱600 a month
  const sl = { ...req('approved', 'approved', 'approved'), id: 'sl', borrowerId: 'me', type: 'flex', amount: 7500, principal: 7500, balance: 7500 } as LoanRequest
  const p2 = { n: 2, startsAt: 1000, dueAt: 2000, endsAt: 3000, last: false }
  const t = (over: Partial<Txn>): Txn => ({ id: Math.random().toString(36), memberId: 'me', memberName: 'M', kind: 'interest', amount: 600, month: 10, cycle: 2026, note: '', createdAt: 1500, loanId: 'sl', ...over })
  const due = (txns: Txn[]) => interestDue(sl, txns, p2)

  it('is the full month until something is paid', () => expect(due([])).toBe(600))
  it('Pay interest clears it; a voided payment does not', () => {
    expect(due([t({})])).toBe(0)
    expect(due([t({ voidedAt: 2 })])).toBe(600)
  })
  it("a payment settles its month: a smaller one's shortfall already went into the balance (customPayment)", () => {
    expect(due([t({ amount: 250 })])).toBe(0)
    expect(due([t({ amount: 900 })])).toBe(0)
    expect(due([t({ kind: 'principal', amount: 100 })])).toBe(0)
  })
  it('a month paid in time is not charged again once a later carryover makes the balance bigger', () => {
    expect(interestDue({ ...sl, type: 'flex', balance: 9000 }, [t({ period: 1 })], { n: 1, startsAt: 1000, dueAt: 2000, endsAt: 2000, last: false })).toBe(0)
  })
  it('only payments for this period count: by their tag, or (older entries) by date', () => {
    expect(due([t({ createdAt: 500 })])).toBe(600)
    expect(due([t({ createdAt: 3000 })])).toBe(600)
    expect(due([t({ loanId: 'other' })])).toBe(600)
    expect(due([t({ createdAt: 500, period: 2 })])).toBe(0)
    expect(due([t({ period: 3 })])).toBe(600)
  })
  it("a carryover for this period puts it in the balance; the Savings Loan's own carry-over mark does not", () => {
    expect(due([t({ kind: 'note', amount: 0, carryover: true, loanBefore: { ...loanSnapshot(sl) } })])).toBe(0)
    expect(due([t({ kind: 'note', amount: 0, carryover: true, loanBefore: { ...loanSnapshot(sl), status: 'withdrawn' } })])).toBe(600)
  })
  it('the unpaid total adds what is due now', () => {
    const oct28 = { ...sl, decidedAt: new Date(2026, 9, 28, 10).getTime() } as LoanRequest
    const dec10 = new Date(2026, 11, 10).getTime()
    // approved Oct 28: on Dec 10 the second period is running
    const u = unpaidLoans([oct28], 'me', 1000, { txns: [], now: dec10 })
    expect(u).toMatchObject({ appTotal: 7500, interestDue: 600, total: 9100 })
    expect(unpaidLoans([oct28], 'me', 1000, { txns: [t({ createdAt: dec10 - 1000 })], now: dec10 }).total).toBe(8500)
  })
})

describe("a Savings Loan's upfront 10% is its first month's interest", () => {
  const NOV = new Date(2026, 10, 9).getTime()
  const sl = { ...req('approved', 'approved', 'approved'), id: 'sl', type: 'savings', amount: 6000, principal: 6000, balance: 6600, upfront: true, createdAt: NOV, decidedAt: NOV } as LoanRequest

  it('nothing extra is due in the month it starts (₱6,600 owed in all)', () => {
    expect(interestDue(sl, [], loanPeriod(sl, NOV + 3600_000))).toBe(0)
    expect(unpaidLoans([sl], 'me', 0, { txns: [], now: new Date(2026, 10, 20).getTime() }).total).toBe(6600)
  })
  it('Pay interest then takes the ₱600 off: ₱6,000 owed', () => {
    const p = payInterest(sl, 0)
    expect(p).toMatchObject({ collected: 600, update: { balance: 6000, interestPayments: 1 } })
  })
  it('next month ₱600 is due again; paying it leaves ₱6,000', () => {
    const paid = { ...sl, balance: 6000 }
    expect(interestDue(paid, [], loanPeriod(paid, new Date(2026, 11, 12).getTime()))).toBe(600)
    expect(payInterest(paid, 600)).toMatchObject({ collected: 600, update: { balance: 6000 } })
  })
  it('a month not paid is carried over into the balance (₱6,600), and paying it later takes it off again', () => {
    const paid = { ...sl, balance: 6000 }
    const carried = { ...paid, ...carryover(paid, 600) }
    expect(carried.balance).toBe(6600)
    expect(payInterest(carried, 0)).toMatchObject({ collected: 600, update: { balance: 6000 } })
  })
  it('a custom payment with nothing due this month comes off the upfront interest, then the missed savings', () => {
    expect(customPayment(sl, 600, 0)).toMatchObject({ interestPart: 0, collected: 600, balance: 6000, principal: 6000 })
    expect(customPayment(sl, 1000, 0)).toMatchObject({ collected: 600, balance: 5600, principal: 5600 })
  })
  it('nothing to pay when this month is paid and no interest sits in the balance', () => {
    expect(payInterest({ ...sl, balance: 6000 }, 0).collected).toBe(0)
  })
})

describe('Pay For Savings: the missed savings of a Savings Loan, paid back', () => {
  const sl = { ...req('approved', 'approved', 'approved'), id: 'sl', type: 'savings', amount: 6000, principal: 6000, balance: 6600, upfront: true, carriedMonth: 10 } as LoanRequest

  it('pays the ₱6,000; only the ₱600 interest stays owed', () => {
    expect(savingsPayback(sl)).toEqual({ amount: 6000, update: { balance: 600, principal: 0, savingsSettled: true } })
  })
  it('closes the loan when the interest was already paid', () => {
    expect(savingsPayback({ ...sl, balance: 6000 })).toEqual({ amount: 6000, update: { balance: 0, principal: 0, savingsSettled: true, status: 'paid' } })
  })
  it('nothing to pay once the savings are paid back', () => expect(savingsPayback({ ...sl, principal: 0, balance: 600 })).toBeNull())
  it('only for Savings Loans', () => expect(savingsPayback({ ...sl, type: 'flex' })).toBeNull())
  it('afterwards no more interest builds up, and Pay interest pays the last ₱600', () => {
    const after = { ...sl, balance: 600, principal: 0 }
    expect(monthInterest(after)).toBe(0)
    expect(payInterest(after, 0)).toMatchObject({ collected: 600, update: { balance: 0 } })
  })
})

describe("each loan's interest is due monthly from its start (Philippine time), Dec 15 at the latest", () => {
  const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m, d, h - 8) // h o'clock in Manila
  const loan = (decidedAt: number, over: Partial<LoanRequest> = {}) => ({ ...req('approved', 'approved', 'approved'), decidedAt, ...over } as LoanRequest)

  it('the period a chosen day falls in: Feb 6 loan, May 4 is in Apr 6 – May 6 (due May 6), May 17 in the one due Jun 6', () => {
    const r = loan(at(2026, 1, 6, 10))
    expect(loanPeriod(r, at(2026, 4, 4))).toMatchObject({ n: 3, dueAt: at(2026, 4, 6, 0) })
    expect(loanPeriod(r, at(2026, 4, 17))).toMatchObject({ n: 4, dueAt: at(2026, 5, 6, 0) })
  })
  it('approved Oct 28: period 1 is due Nov 28, period 2 runs from Nov 29', () => {
    const r = loan(at(2026, 9, 28, 10))
    expect(loanPeriod(r, at(2026, 10, 10))).toEqual({ n: 1, startsAt: at(2026, 9, 28, 10), dueAt: at(2026, 10, 28, 0), endsAt: at(2026, 10, 29, 0), last: false })
    expect(loanPeriod(r, at(2026, 10, 28, 23)).n).toBe(1) // Nov 28 is still the due day
    // Nov 29: period 2, due Dec 15 (not Dec 28: nothing runs past Dec 15)
    expect(loanPeriod(r, at(2026, 10, 29, 0) + 60_000)).toMatchObject({ n: 2, startsAt: at(2026, 10, 29, 0), dueAt: at(2026, 11, 15, 0), last: true })
    expect(loanPeriod(r, at(2026, 11, 20)).n).toBe(2) // after Dec 15 it stays the last period
  })
  it('a month without that day uses its last day', () => {
    const r = loan(at(2026, 0, 31))
    expect(loanPeriod(r, at(2026, 1, 10)).dueAt).toBe(at(2026, 1, 28, 0))
    expect(loanPeriod(r, at(2026, 2, 10))).toMatchObject({ n: 2, dueAt: at(2026, 2, 31, 0) })
  })
  it("a Savings Loan: each month's interest is due by that month's 7th, like savings", () => {
    // July's missed savings, carried over on Nov 9: July is the upfront 10%; Aug, Sep, Oct, Nov have passed their 7th
    const july = loan(at(2026, 10, 9), { type: 'savings', carriedMonth: 6, upfront: true })
    expect(endedPeriods(july, at(2026, 10, 10)).map((p) => [p.n, p.dueAt])).toEqual([
      [1, at(2026, 6, 7, 0)], [2, at(2026, 7, 7, 0)], [3, at(2026, 8, 7, 0)], [4, at(2026, 9, 7, 0)], [5, at(2026, 10, 7, 0)],
    ])
    expect(loanPeriod(july, at(2026, 10, 10))).toMatchObject({ n: 6, dueAt: at(2026, 11, 7, 0), last: true }) // December's
    // October's: upfront for October; November's 7th has passed
    const oct = loan(at(2026, 10, 9), { type: 'savings', carriedMonth: 9, upfront: true })
    expect(endedPeriods(oct, at(2026, 10, 10)).map((p) => p.n)).toEqual([1, 2])
  })
  it("December's Savings Loan has only its upfront month; it is paid by Dec 15", () => {
    const dec = loan(at(2026, 10, 9), { type: 'savings', carriedMonth: 11, upfront: true })
    expect(loanPeriod(dec, at(2026, 10, 10))).toMatchObject({ n: 1, dueAt: at(2026, 11, 7, 0), last: true })
    expect(loanDeadline(dec)).toBe(at(2026, 11, 15, 0))
  })
  it('missed interest: every ended period still unpaid, added oldest first', () => {
    const july = { ...loan(at(2026, 10, 9), { type: 'savings', carriedMonth: 6, upfront: true }), id: 'sl', amount: 6000, principal: 6000, balance: 6600 } as LoanRequest
    const m = missedInterest(july, [], at(2026, 10, 10))
    expect(m).toMatchObject({ balance: 9663.06, carryovers: 4 })
    expect(m?.entries.map((e) => [e.period, e.due, e.balance])).toEqual([[2, 660, 7260], [3, 726, 7986], [4, 798.6, 8784.6], [5, 878.46, 9663.06]])
    // a ₱600 interest payment doesn't stop the next month's 10% (only paying in full does)
    const paidAug: Txn = { id: 'x', memberId: 'm', memberName: 'M', kind: 'interest', amount: 600, month: 7, cycle: 2026, note: '', createdAt: 1, loanId: 'sl', period: 2 }
    expect(missedInterest(july, [paidAug], at(2026, 10, 10))?.balance).toBe(9663.06)
    expect(missedInterest(july, [], at(2026, 6, 20))).toBeNull()
  })
  it('ended periods stop at Dec 15', () => {
    expect(endedPeriods(loan(at(2026, 9, 28, 10)), at(2027, 1, 1)).map((p) => p.n)).toEqual([1, 2])
  })
})

describe("Savings Loan: each 8th adds the month's 10% until paid in full", () => {
  const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m, d, h - 8)
  const oct = { ...req('approved', 'approved', 'approved'), id: 'sl', type: 'savings', carriedMonth: 9, upfront: true, amount: 6000, principal: 6000, balance: 6600, decidedAt: at(2026, 9, 8) } as LoanRequest
  const t = (over: Partial<Txn>): Txn => ({ id: 'x', memberId: 'm', memberName: 'M', kind: 'interest', amount: 600, month: 9, cycle: 2026, note: '', createdAt: at(2026, 9, 20), loanId: 'sl', ...over })

  it("October's: Nov 8 adds 10% of the ₱6,600 (₱7,260); Dec 8 adds 10% of that (₱7,986)", () => {
    expect(missedInterest(oct, [], at(2026, 10, 10))).toMatchObject({ balance: 7260, carryovers: 1 })
    expect(missedInterest(oct, [], at(2026, 11, 10))).toMatchObject({ balance: 7986, carryovers: 2 })
  })
  it('paying ₱600 interest in October takes it off, but November is still added (only paying in full stops it)', () => {
    const afterPay = { ...oct, balance: 6000 }
    expect(missedInterest(afterPay, [t({})], at(2026, 10, 10))).toMatchObject({ balance: 6600 })
  })
  it('paid in full (nothing left of the missed savings): nothing more is added', () => {
    expect(missedInterest({ ...oct, principal: 0, balance: 0 }, [], at(2026, 10, 10))).toBeNull()
  })
  it('nothing is "due" separately, so the unpaid total is just what is owed', () => {
    expect(unpaidLoans([{ ...oct, borrowerId: 'me' }], 'me', 0, { txns: [], now: at(2026, 9, 20) }).total).toBe(6600)
    expect(unpaidLoans([{ ...oct, borrowerId: 'me', balance: 7260 }], 'me', 0, { txns: [], now: at(2026, 10, 10) }).total).toBe(7260)
  })

})

it('waivedDue: the interest is skipped only when the payment is bigger than it', () => {
  expect(waivedDue(24825.44, 4478.98)).toBe(0)
  expect(waivedDue(4478.98, 4478.98)).toBe(4478.98)
  expect(waivedDue(1000, 4478.98)).toBe(4478.98)
})

describe("a loan's history replayed: payments recorded late for earlier months", () => {
  const at = (m: number, d: number, h = 12) => Date.UTC(2026, m, d, h - 8) // h o'clock in Manila
  // Mark Anthony: Flex ₱48,000 on Feb 6, paid ₱24,825.44 on May 4 (April 6 – May 6) and ₱20,490.96 on May 17
  const flex = { ...req('approved', 'approved', 'approved'), id: 'fl', type: 'flex', amount: 48000, decidedAt: at(1, 6) } as LoanRequest
  const pays = [{ at: at(4, 17), amount: 20490.96, period: 4 }, { at: at(4, 4), amount: 24825.44, period: 3 }]

  it("carries Mar 6 and Apr 6; a payment inside a month skips that month's interest and comes off the balance; Jul 6 on what is left", () => {
    const h = replayLoan(flex, pays, at(6, 20))
    expect(h.steps.map((s) => s.type === 'carryover' ? ['carryover', s.period.n, s.due, s.balance] : ['payment', s.pay.period, s.collected, s.principalPaid, s.balance])).toEqual([
      ['carryover', 1, 3840, 51840],
      ['carryover', 2, 4147.2, 55987.2],
      ['payment', 3, 7987.2, 16838.24, 31161.76], // the ₱7,987.20 carried interest, then the loan: ₱55,987.20 − ₱24,825.44
      ['payment', 4, 0, 20490.96, 10670.8],
      ['carryover', 5, 853.66, 11524.46],
    ])
    expect(h).toMatchObject({ balance: 11524.46, principal: 10670.8, carryovers: 3 })
  })
  it('a payment covering everything owed closes the loan', () => {
    const h = replayLoan(flex, [{ at: at(2, 1), amount: 48000, period: 1 }], at(6, 20))
    expect(h).toMatchObject({ balance: 0, paidOffAt: at(2, 1) })
  })
  it("a payment no bigger than its month's interest pays the interest first; the shortfall goes into the balance", () => {
    const h = replayLoan(flex, [{ at: at(4, 4), amount: 1000, period: 3 }], at(4, 20))
    expect(h.steps[2]).toMatchObject({ type: 'payment', interestPart: 1000, principalPaid: 0, balance: 59466.18 }) // ₱55,987.20 + ₱3,478.98 short
    expect(h.steps).toHaveLength(3) // and May isn't carried over again
  })
  it('Pay interest (interest only) still pays its month\'s interest', () => {
    const h = replayLoan(flex, [{ at: at(2, 1), amount: 3840, period: 1, interestOnly: true }], at(2, 20))
    expect(h.steps).toEqual([{ type: 'payment', pay: expect.anything(), interestPart: 3840, collected: 3840, principalPaid: 0, balance: 48000 }])
  })
  it('refuses a payment bigger than what was owed on its day', () => {
    expect(() => replayLoan(flex, [{ at: at(1, 10), amount: 60000, period: 1 }], at(6, 20))).toThrow(/more than/)
  })
})
