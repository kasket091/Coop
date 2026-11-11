// Members' payment requests (Pay Now on a loan, Pay savings): the request, and the rules for what each choice
// costs. Pure: the admin's approval records them with the existing loan and savings logic (store.ts).
import { firstPeso } from './account-log'
import type { Txn } from './ledger'
import { peso } from './format'
import { balanceOf, customPayment, interestDueNow, loanDeadline, loanPeriod, type CustomPayment, paymentHistory, periodAt, principalOf, recordedLate, replayLoan, waivedDue, type LoanRequest } from './requests'
import { DUE_DAY, monthlyDue } from './rules'

export type PayChoice = 'interest' | 'full' | 'custom'
export type PaymentRequest = {
  id: string; memberId: string; memberName: string; kind: 'loan' | 'savings' | 'advance'
  loanId?: string; loanLabel?: string; choice?: PayChoice; months?: string[]; month?: number
  /** advance savings: the future months paid in full (0–11) */
  advanceMonths?: number[]
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
  if (p.kind !== 'loan') return { savings: true }
  if (!loan) return { error: 'This loan no longer exists.' }
  if (loan.status === 'paid') return { error: 'This loan is already paid off.' }
  if (loan.status !== 'approved') return { error: 'This loan is no longer open.' }
  const period = loanPeriod(loan, approvalDates(p, loan).forAt)
  if (recordedLate(loan, txns, p.createdAt, period.n)) {
    try { return { balance: replayLoan(loan, [...paymentHistory(loan, txns), { at: p.createdAt, amount: p.amount, period: period.n }]).balance } }
    catch (e) { return { error: (e as Error).message } }
  }
  const r = customPayment(loan, p.amount, waivedDue(p.amount, interestDueNow(loan, txns, p.createdAt, period)))
  return 'error' in r ? r : { balance: r.balance }
}

/**
 * The dates approval records a loan payment with: the day it was sent, counted for the period running then, or the
 * loan's last (Dec 15) period when sent after it, so Approve doesn't fail on a late payment.
 */
export const approvalDates = (p: PaymentRequest, loan: LoanRequest) => ({ at: p.createdAt, forAt: Math.min(p.createdAt, loanDeadline(loan)) })

/** The split of a payment, in words (the member's pop-up and the admin's Advance/Custom Payment say the same). */
export function previewText(p: Exclude<CustomPayment, { error: string }>, amount: number, due: number): string {
  const short = cents(waivedDue(amount, due) - p.interestPart)
  return `${p.interestPart > 0 ? `${peso(p.interestPart)} this month's interest + ` : ''}${p.collected > p.interestPart ? `${peso(cents(p.collected - p.interestPart))} missed interest + ` : ''}`
    + `${peso(Math.max(0, cents(amount - p.collected)))} off the loan · ${p.paidOff ? 'loan fully paid' : `new balance ${peso(p.balance)}`}`
    + (short > 0 ? ` (${peso(short)} unpaid interest added to the balance)` : '')
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** Why a savings request might double-count its month (already paid, or carried over into a Savings Loan), or ''. */
export function savingsAlreadyIn(p: PaymentRequest, m: { heads: number; paid: number[]; carried?: number[] }): string {
  const months = p.kind === 'advance' ? p.advanceMonths ?? [] : [p.month ?? 0]
  const each = cents(p.amount / Math.max(1, months.length))
  for (const i of months) {
    if ((m.carried?.[i] ?? 0) > 0) return `${MONTH_NAMES[i]} savings were carried over into a Savings Loan; approving adds ${peso(each)} more. Use Pay For Savings on that loan instead.`
    if ((m.paid[i] ?? 0) >= monthlyDue(m.heads)) return `${MONTH_NAMES[i]} savings are already fully paid; approving adds ${peso(each)} more.`
  }
  return ''
}

/**
 * The months a member can pay ahead (tap on the Savings tab): after the current month (Manila), in this cycle, not
 * already paid or carried over, and not in a payment request still waiting. Each is paid in full.
 */
export function advanceMonths(m: { heads: number; paid: number[]; carried?: number[] }, now: Date, year: number, waiting: PaymentRequest[]): number[] {
  const d = manila(now.getTime())
  if (d.getUTCFullYear() !== year) return []
  const sent = new Set(waiting.filter((p) => p.status === 'pending').flatMap((p) => p.advanceMonths ?? (p.kind === 'savings' ? [p.month ?? -1] : [])))
  const out: number[] = []
  for (let i = d.getUTCMonth() + 1; i < 12; i++) if ((m.paid[i] ?? 0) < monthlyDue(m.heads) && !((m.carried?.[i] ?? 0) > 0) && !sent.has(i)) out.push(i)
  return out
}
