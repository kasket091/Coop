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
