import { expect, it } from 'vitest'
import { RECRUITS, recruiterOf, BOARD } from './accounts'
import { ledgerFrom, newestLiveForLoan, quarterTotals, type Txn } from './ledger'

const t = (over: Partial<Txn>): Txn => ({
  id: Math.random().toString(36), memberId: 'm', memberName: 'M', kind: 'savings', amount: 0, month: 0, cycle: 2026,
  note: '', createdAt: 0, ...over,
})

it('ledger adds savings and interest by month, ignoring voided, other cycles and non-money kinds', () => {
  const l = ledgerFrom([
    t({ kind: 'savings', amount: 6000, month: 0 }), t({ kind: 'savings', amount: 6000, month: 0, voidedAt: 1 }),
    t({ kind: 'interest', amount: 400, month: 10 }), t({ kind: 'interest', amount: 80, month: 10 }),
    t({ kind: 'principal', amount: 1000, month: 10 }), t({ kind: 'release', amount: 5000, month: 10 }),
    t({ kind: 'note', amount: 0, month: 10 }), t({ kind: 'savings', amount: 999, month: 0, cycle: 2025 }),
  ], 2026)
  expect(l.paid[0]).toBe(6000)
  expect(l.interest[10]).toBe(480)
  expect(l.paid.reduce((a, b) => a + b)).toBe(6000)
})

it('quarter totals', () => expect(quarterTotals([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4])).toEqual([3, 6, 9, 12]))

it('the newest live transaction of a loan is the only one that can be voided', () => {
  const txns = [t({ id: 'a', loanId: 'L', createdAt: 1 }), t({ id: 'b', loanId: 'L', createdAt: 3, voidedAt: 9 }),
    t({ id: 'c', loanId: 'L', createdAt: 2 }), t({ id: 'd', loanId: 'X', createdAt: 5 })]
  expect(newestLiveForLoan(txns, 'L')?.id).toBe('c')
})

it('recruiters: 22 recruits, each with one recruiter; Bryan recruits but is on the board', () => {
  expect(Object.values(RECRUITS).flat()).toHaveLength(22)
  expect(recruiterOf('isabel tabuan')).toBe('Bryan Kevin Tabuan')
  expect(recruiterOf('Chai Rebosura')).toBe('Joyma Tumanda')
  expect(recruiterOf('Mark Dave Tumanda')).toBeUndefined()
  expect(BOARD).toContain('Bryan Kevin Tabuan')
  expect(BOARD).toHaveLength(11)
})
