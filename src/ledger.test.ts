import { expect, it } from 'vitest'
import { RECRUITS, recruiterOf, BOARD } from './accounts'
import { carryoverMonths, ledgerFrom, monthRange, newestLiveForLoan, quarterTotals, type Txn } from './ledger'

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

it('carryover months: live carryover marks per member, this cycle only', () => {
  const marks = carryoverMonths([
    t({ memberId: 'ma', kind: 'note', carryover: true, month: 6 }), t({ memberId: 'ma', kind: 'note', carryover: true, month: 10 }),
    t({ memberId: 'ma', kind: 'note', carryover: true, month: 7, voidedAt: 5 }),
    t({ memberId: 'ev', kind: 'note', carryover: true, month: 8 }), t({ memberId: 'ev', kind: 'note', carryover: true, month: 9, cycle: 2025 }),
    t({ memberId: 'ev', kind: 'note', month: 3 }),
  ], 2026)
  expect([...(marks.get('ma') ?? [])].sort((a, b) => a - b)).toEqual([6, 10])
  expect([...(marks.get('ev') ?? [])]).toEqual([8])
})

it('a month range for carryover marks', () => {
  expect(monthRange(6, 10)).toEqual([6, 7, 8, 9, 10])
  expect(monthRange(10, 6)).toEqual([6, 7, 8, 9, 10])
})

it('carried-over savings (tied to a Savings Loan) are shown, not counted as saved', () => {
  const l = ledgerFrom([
    t({ kind: 'savings', amount: 6000, month: 5 }),
    t({ kind: 'savings', amount: 5500, month: 6, loanId: 'SL1' }),
  ], 2026)
  expect(l.paid[6]).toBe(0)
  expect(l.paid[5]).toBe(6000)
  expect(l.carried[6]).toBe(5500)
})

it('once its Savings Loan is paid, the carried amount moves into savings', () => {
  const carry = t({ kind: 'savings', amount: 6000, month: 6, loanId: 'SL1' })
  const settle = t({ kind: 'savings', amount: 6000, month: 6, loanId: 'SL1', settles: true })
  const l = ledgerFrom([carry, settle], 2026)
  expect(l.paid[6]).toBe(6000)
  expect(l.carried[6]).toBe(0)
  // voiding the payoff puts it back to carried
  expect(ledgerFrom([carry, { ...settle, voidedAt: 1 }], 2026)).toMatchObject({ paid: expect.arrayContaining([0]), carried: expect.arrayContaining([6000]) })
})
