import { describe, expect, it } from 'vitest'
import type { Txn } from './ledger'
import { choiceAmount, choicePreview, savingsPayMonth, savingsPayOpen, unpaidInterestMonths } from './payments'
import type { LoanRequest } from './requests'

const at = (m: number, d: number, h = 12) => Date.UTC(2026, m, d, h - 8) // h o'clock in Manila
const flex = {
  id: 'L1', borrowerId: 'me', borrowerName: 'Ana', type: 'flex', amount: 48000, principal: 48000, balance: 55987.2, status: 'approved',
  decidedAt: at(1, 6), createdAt: at(1, 6), comakers: {}, comakerIds: [], months: 1, quote: '', ref: '3FL',
} as unknown as LoanRequest
let n = 0
const carry = (period: number, note: string, over: Partial<Txn> = {}): Txn => ({
  id: `c${n++}`, memberId: 'me', memberName: 'Ana', kind: 'note', amount: 0, month: 2, cycle: 2026, note, createdAt: at(10, 1),
  loanId: 'L1', carryover: true, period, loanBefore: { status: 'approved' } as Txn['loanBefore'], ...over,
})
const txns = [
  carry(1, 'Carryover: ₱3,840 interest due Mar 6 was not paid; balance now ₱51,840'),
  carry(2, 'Carryover: ₱4,147.20 interest due Apr 6 was not paid; balance now ₱55,987.20'),
]

describe('missed interest still unpaid, for the Custom Payment tick boxes', () => {
  it('lists every carried month while none of it is paid, oldest first', () => {
    expect(unpaidInterestMonths(flex, txns).map((m) => [m.period, m.amount])).toEqual([[1, 3840], [2, 4147.2]])
  })
  it('payments clear the oldest first, so only the newest are left; a partly paid month shows what is left of it', () => {
    expect(unpaidInterestMonths({ ...flex, balance: 52000 }, txns).map((m) => [m.period, m.amount])).toEqual([[2, 4000]])
  })
  it('nothing carried, nothing listed; voided carryovers are ignored', () => {
    expect(unpaidInterestMonths({ ...flex, balance: 48000 }, txns)).toEqual([])
    expect(unpaidInterestMonths({ ...flex, balance: 51840 }, [txns[0], { ...txns[1], voidedAt: 1 }]).map((m) => m.period)).toEqual([1])
  })
  it("each month carries its due date, from the loan's periods", () => {
    expect(unpaidInterestMonths(flex, txns)[0].dueAt).toBe(at(2, 6, 0))
  })
})

describe('the amount each choice fills in', () => {
  it('Full payment is everything owed; Interest is the interest due now', () => {
    expect(choiceAmount(flex, [], 'full', at(4, 4))).toBe(55987.2)
    expect(choiceAmount(flex, [], 'interest', at(4, 4))).toBe(4478.98)
  })
  it("a Savings Loan has no separate interest to pay", () => {
    expect(choiceAmount({ ...flex, type: 'savings', carriedMonth: 1, upfront: true } as LoanRequest, [], 'interest', at(4, 4))).toBe(0)
  })
})

describe('the preview, the same split the admin form gives', () => {
  it("more than the month's interest: it isn't charged, all comes off the balance", () => {
    expect(choicePreview(flex, [], 24825.44, at(4, 4))).toMatchObject({ balance: 31161.76 })
  })
  it("no more than the month's interest: it is paid first and the shortfall goes into the balance", () => {
    expect(choicePreview(flex, [], 1000, at(4, 4))).toMatchObject({ interestPart: 1000, balance: 59466.18 })
  })
})

describe('Pay savings: open from the 1st to the 7th (Manila)', () => {
  it('open through the 7th, closed from the 8th', () => {
    expect(savingsPayOpen(new Date(at(10, 7, 23)), 2026)).toBe(true)
    expect(savingsPayOpen(new Date(at(10, 8, 0.5)), 2026)).toBe(false)
  })
  it('closed outside the cycle year', () => expect(savingsPayOpen(new Date(Date.UTC(2027, 0, 3, 4)), 2026)).toBe(false))
  it("the month is Manila's: Oct 31, 5 PM in UTC is already Nov 1 in Manila", () => {
    expect(savingsPayMonth(new Date(Date.UTC(2026, 9, 31, 17)))).toBe(10)
  })
})
