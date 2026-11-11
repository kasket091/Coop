// Members' payment requests (Pay Now on a loan, Pay savings): the request, and the rules for what each choice
// costs. Pure: the admin's approval records them with the existing loan and savings logic (store.ts).
import { firstPeso } from './account-log'
import type { Txn } from './ledger'
import { balanceOf, customPayment, interestDueNow, loanPeriod, paymentHistory, periodAt, principalOf, recordedLate, replayLoan, waivedDue, type LoanRequest } from './requests'
import { DUE_DAY } from './rules'

export type PayChoice = 'interest' | 'full' | 'custom'
export type PaymentRequest = {
  id: string; memberId: string; memberName: string; kind: 'loan' | 'savings'
  loanId?: string; loanLabel?: string; choice?: PayChoice; months?: string[]; month?: number
  amount: number; createdAt: number; status: 'pending' | 'approved' | 'rejected'; decidedAt?: number; reason?: string
}

const cents = (x: number) => Math.round(x * 100) / 100
const manila = (ms: number) => new Date(ms + 8 * 3600_000) // read with UTC getters

/**
 * The months of missed interest still unpaid on a loan, oldest first. Payments clear the oldest carried interest
 * first, so the unpaid ones are the newest carryovers that make up what is still carried (balance − principal); the
 * oldest of those may be partly paid, and shows what is left of it.
 */
export function unpaidInterestMonths(r: LoanRequest, txns: Txn[]): { period: number; dueAt: number; amount: number }[] {
  let left = cents(balanceOf(r) - principalOf(r))
  const out: { period: number; dueAt: number; amount: number }[] = []
  const carried = txns.filter((t) => t.loanId === r.id && !t.voidedAt && t.carryover && t.loanBefore?.status === 'approved' && t.period)
    .sort((a, b) => b.period! - a.period!)
  for (const t of carried) {
    if (left <= 0) break
    const amount = Math.min(firstPeso(t.note) ?? 0, left)
    if (amount > 0) out.unshift({ period: t.period!, dueAt: periodAt(r, t.period!).dueAt, amount: cents(amount) })
    left = cents(left - amount)
  }
  return out
}

/** What Interest or Full payment fills in: the interest due now (none for a Savings Loan), or everything owed. */
export const choiceAmount = (r: LoanRequest, txns: Txn[], choice: 'interest' | 'full', now: number) =>
  choice === 'full' ? balanceOf(r) : interestDueNow(r, txns, now)

/** The split a payment of `amount` on `now` gives: the same rule as the admin's Advance/Custom Payment. */
export const choicePreview = (r: LoanRequest, txns: Txn[], amount: number, now: number) =>
  customPayment(r, amount, waivedDue(amount, interestDueNow(r, txns, now)))

/** Pay savings is open from the 1st to the 7th of the month (Manila), in the cycle year. */
export const savingsPayOpen = (now: Date, year: number) => {
  const d = manila(now.getTime())
  return d.getUTCFullYear() === year && d.getUTCDate() <= DUE_DAY
}
/** The month (0–11) Pay savings is for: the current month in Manila. */
export const savingsPayMonth = (now: Date) => manila(now.getTime()).getUTCMonth()

/**
 * What approving a request will record, worked out before the admin taps Approve: the loan's balance after it, as
 * of the day it was sent (rebuilt from its payments in date order when sent for a month already carried over, the
 * same as a late Advance/Custom Payment), or why it can't be recorded. Savings need nothing worked out.
 */
export function approvalPreview(p: PaymentRequest, loan: LoanRequest | undefined, txns: Txn[]): { savings: true } | { balance: number } | { error: string } {
  if (p.kind === 'savings') return { savings: true }
  if (!loan) return { error: 'This loan no longer exists.' }
  if (loan.status === 'paid') return { error: 'This loan is already paid off.' }
  if (loan.status !== 'approved') return { error: 'This loan is no longer open.' }
  const period = loanPeriod(loan, p.createdAt)
  if (recordedLate(loan, txns, p.createdAt, period.n)) {
    try { return { balance: replayLoan(loan, [...paymentHistory(loan, txns), { at: p.createdAt, amount: p.amount, period: period.n }]).balance } }
    catch (e) { return { error: (e as Error).message } }
  }
  const r = customPayment(loan, p.amount, waivedDue(p.amount, interestDueNow(loan, txns, p.createdAt, period)))
  return 'error' in r ? r : { balance: r.balance }
}
