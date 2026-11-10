import { expect, it } from 'vitest'
import { accountLog } from './account-log'
import type { Txn } from './ledger'
import type { LoanRequest } from './requests'

const MAR6 = Date.UTC(2026, 2, 6, 4)
const day = (m: number, d: number) => Date.UTC(2026, m, d, 4)
const snap = (balance: number, status = 'approved') => ({ status, balance, principal: 48000, carryovers: 0, interestPayments: 0, customPayments: 0 }) as Txn['loanBefore']
let n = 0
const t = (over: Partial<Txn>): Txn => ({ id: `t${n++}`, memberId: 'me', memberName: 'Ana', kind: 'note', amount: 0, month: 2, cycle: 2026, note: '', createdAt: MAR6, ...over })

const flex = {
  id: 'L1', borrowerId: 'me', borrowerName: 'Ana', type: 'flex', amount: 48000, balance: 31161.56, status: 'approved', ref: '3FL',
  decidedAt: MAR6, createdAt: MAR6, comakers: {}, comakerIds: [], months: 1, quote: '',
} as unknown as LoanRequest

const txns: Txn[] = [
  t({ kind: 'release', amount: 48000, loanId: 'L1', loanBefore: snap(48000, 'pending'), note: 'Loan 3FL approved' }),
  t({ loanId: 'L1', carryover: true, loanBefore: snap(48000), createdAt: day(3, 6), note: 'Carryover (automatic): ₱3,840 interest due Apr 6 was not paid; balance now ₱51,840' }),
  t({ kind: 'principal', amount: 20678.44, loanId: 'L1', loanBefore: snap(51840), createdAt: day(4, 4), paidOn: day(4, 2), note: 'Custom payment of ₱20,678.44 paid May 2: off the balance' }),
  t({ kind: 'interest', amount: 999, loanId: 'L1', loanBefore: snap(31161.56), createdAt: day(4, 5), voidedAt: day(4, 6), note: 'voided: not shown' }),
  t({ kind: 'savings', amount: 6000, month: 0, createdAt: day(0, 5), note: '' }),
]

it('by month, newest first, with each loan grouped under its ID (voided entries left out)', () => {
  const late = t({ kind: 'savings', amount: 6000, month: 4, createdAt: day(4, 3), note: '' })
  expect(accountLog([flex], [...txns, late])).toEqual([
    { title: 'May', groups: [
      { title: 'Savings', lines: [{ at: day(4, 3), label: 'May savings', amount: 6000 }] },
      { title: '3FL · Flex loan', lines: [{ at: day(4, 2), label: 'Capital Payment', amount: 20678.44, balance: 31161.56 }] },
    ] },
    { title: 'April', groups: [{ title: '3FL · Flex loan', lines: [{ at: day(3, 6), label: 'Carry Over Interest', amount: 3840, balance: 51840 }] }] },
    { title: 'March', groups: [{ title: '3FL · Flex loan', lines: [{ at: MAR6, label: 'Capital', amount: 48000, balance: 48000 }] }] },
    { title: 'January', groups: [{ title: 'Savings', lines: [{ at: day(0, 5), label: 'Jan savings', amount: 6000 }] }] },
  ])
})

it('a paid-off loan ends at nothing owed', () => {
  const paid = { ...flex, status: 'paid' } as LoanRequest
  expect(accountLog([paid], txns)[0].groups[0].lines[0].balance).toBe(0)
})

it('a Savings Loan opens with the carried-over savings and the 10% added', () => {
  const sl = { ...flex, id: 'S1', type: 'savings', ref: '4SL', amount: 6000, balance: 6600, carriedMonth: 9, upfront: true } as LoanRequest
  const open = [t({ kind: 'savings', amount: 6000, loanId: 'S1', loanBefore: snap(6600, 'withdrawn'), note: 'October savings carried over as loan 4SL' })]
  expect(accountLog([sl], open)).toEqual([{ title: 'October', groups: [{ title: '4SL · Savings Loan', lines: [{ at: MAR6, label: 'Oct savings carried over (+10%)', amount: 6000, balance: 6600 }] }] }])
})

it('carryovers added together (a backdated loan) go under the due dates they were for, in order', () => {
  // approved Mar 6, recorded Nov 10: Apr 6 and May 6 carried over in one go
  const NOV10 = day(10, 10)
  const back = [
    t({ loanId: 'L1', carryover: true, period: 2, loanBefore: snap(48000), createdAt: NOV10, note: 'Carryover: ₱4,147.20 interest due May 6 was not paid; balance now ₱55,987.20' }),
    t({ loanId: 'L1', carryover: true, period: 1, loanBefore: snap(48000), createdAt: NOV10, note: 'Carryover: ₱3,840 interest due Apr 6 was not paid; balance now ₱51,840' }),
  ]
  const at = (m: number, d: number) => Date.UTC(2026, m, d) - 8 * 3600_000 // midnight in Manila
  expect(accountLog([{ ...flex, balance: 55987.2 }], back).map((s) => [s.title, s.groups[0].lines.map((l) => [l.at, l.balance])])).toEqual([
    ['May', [[at(4, 6), 55987.2]]],
    ['April', [[at(3, 6), 51840]]],
    ['March', [[MAR6, 48000]]],
  ])
})

it("a recalculated loan: one Interest and Loan Payment line per payment, its balance, and no line for the recalculation itself", () => {
  const NOV10 = day(10, 10)
  const re = [
    t({ loanId: 'L1', restores: ['old1'], loanBefore: snap(99999), createdAt: NOV10, note: 'Loan 3FL recalculated from its payments in date order' }),
    t({ kind: 'principal', amount: 12359.26, loanId: 'L1', period: 3, paidOn: day(4, 4), loanBefore: snap(99999), createdAt: NOV10, note: 'Payment of ₱24,825.44 paid May 4: off the balance; balance now ₱35,640.74' }),
    t({ kind: 'interest', amount: 12466.18, loanId: 'L1', period: 3, paidOn: day(4, 4), loanBefore: snap(99999), createdAt: NOV10, note: 'Payment of ₱24,825.44 paid May 4: interest part; balance now ₱35,640.74' }),
  ]
  const may = accountLog([{ ...flex, balance: 35640.74 }], re)[0]
  expect(may).toEqual({ title: 'May', groups: [{ title: '3FL · Flex loan', lines: [{ at: day(4, 4), label: 'Interest and Loan Payment', amount: 24825.44, balance: 35640.74 }] }] })
})

it("savings go under the month they are for, not the day they were recorded", () => {
  const janLate = t({ kind: 'savings', amount: 6000, month: 0, createdAt: day(10, 10) }) // January's, recorded Nov 10
  expect(accountLog([], [janLate])).toEqual([{ title: 'January', groups: [{ title: 'Savings', lines: [{ at: day(10, 10), label: 'Jan savings', amount: 6000 }] }] }])
})

it('a savings carry-over goes under the month whose savings it carried, not the day it was made', () => {
  const sl = { ...flex, id: 'S1', type: 'savings', ref: '4SL', amount: 6000, balance: 6600, carriedMonth: 9, upfront: true, decidedAt: day(10, 10), createdAt: day(10, 10) } as LoanRequest
  expect(accountLog([sl], []).map((s) => s.title)).toEqual(['October'])
})
