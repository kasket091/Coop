// Transactions: the money history. Members' 12-month savings/interest numbers are built from these.
import type { LoanSnapshot } from './requests'

export type TxnKind = 'note' | 'savings' | 'interest' | 'principal' | 'release'
export type Txn = {
  id: string; memberId: string; memberName: string; kind: TxnKind; amount: number; month: number; cycle: number
  loanId?: string; note: string; createdAt: number; voidedAt?: number; voidReason?: string
  /** the loan as it was before this transaction, so voiding it can put the loan back */
  loanBefore?: LoanSnapshot
  /** marks a month where the member's interest was carried over (shown red on the dashboard) */
  carryover?: boolean
  /** which interest period of its loan this entry pays or carries over (requests.ts loanPeriod) */
  period?: number
  /** a Savings Loan was paid off: its carried amount now counts as saved */
  settles?: boolean
  /** the day the money was paid, when recorded later (createdAt stays the day it was recorded) */
  paidOn?: number
  /** a loan recalculated from its history: the entries it replaced (voided); voiding this puts them back */
  restores?: string[]
}

const cents = (x: number) => Math.round(x * 100) / 100

/**
 * Savings and interest per month for one cycle; voided entries and other kinds don't count. Savings tied to a
 * Savings Loan (carried over, not paid) are kept apart in `carried`: shown red, never counted as saved.
 */
export function ledgerFrom(txns: Txn[], cycle: number) {
  const paid = Array<number>(12).fill(0), interest = Array<number>(12).fill(0), carried = Array<number>(12).fill(0)
  for (const t of txns) {
    if (t.voidedAt || t.cycle !== cycle) continue
    if (t.kind === 'savings' && t.settles) {
      carried[t.month] = cents(carried[t.month] - t.amount)
      paid[t.month] = cents(paid[t.month] + t.amount)
    } else if (t.kind === 'savings' && t.loanId) carried[t.month] = cents(carried[t.month] + t.amount)
    else if (t.kind === 'savings') paid[t.month] = cents(paid[t.month] + t.amount)
    if (t.kind === 'interest') interest[t.month] = cents(interest[t.month] + t.amount)
  }
  return { paid, interest, carried }
}

export const quarterTotals = (months: number[]) => [0, 3, 6, 9].map((i) => cents(months[i] + months[i + 1] + months[i + 2]))

/** Only a loan's newest live transaction may be voided, so the loan's history never contradicts itself. */
export const newestLiveForLoan = (txns: Txn[], loanId: string) =>
  txns.filter((t) => t.loanId === loanId && !t.voidedAt).sort((a, b) => b.createdAt - a.createdAt)[0]

/** Months (0–11) per member that carried interest over this cycle; voided marks don't count. */
export function carryoverMonths(txns: Txn[], cycle: number): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  for (const t of txns) {
    if (!t.carryover || t.voidedAt || t.cycle !== cycle) continue
    if (!out.has(t.memberId)) out.set(t.memberId, new Set())
    out.get(t.memberId)!.add(t.month)
  }
  return out
}

export const monthRange = (a: number, b: number) =>
  Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i)

/**
 * Savings paid in advance: recorded (Record savings, with a later month picked) before the month they are for began,
 * in Philippine time. Savings Loan entries and voided ones aren't money paid in advance. Newest first.
 */
export function advancePayments(txns: Txn[], cycle: number) {
  return txns
    .filter((t) => t.kind === 'savings' && !t.voidedAt && !t.loanId && !t.settles && t.cycle === cycle && isAdvance(t.month, cycle, t.createdAt))
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Savings for `month` recorded at `at` are paid in advance: before that month began (Philippine time). */
export const isAdvance = (month: number, cycle: number, at: number) => at < Date.UTC(cycle, month, 1) - 8 * 3600_000

/**
 * A savings entry, for highlighting a month: savings paid (or paid back), and a missed month carried over as a Savings
 * Loan (its carry-over mark and the loan released). Not interest, loan payments, or other loans.
 */
export const savingsEntry = (t: Txn, savingsLoanIds: Set<string>) =>
  t.kind === 'savings' || (!!t.loanId && savingsLoanIds.has(t.loanId) && (t.kind === 'release' || (!!t.carryover && t.loanBefore?.status !== 'approved')))
