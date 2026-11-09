import type { Txn } from './ledger'
import { depositAmount, loanLimit, MONTHLY_LOANS, monthlyLoanError, monthsLeft, regularLoan, regularTerms, type Member, type MonthlyLoanType } from './rules'

export type LoanType = 'regular' | MonthlyLoanType
export type CoStatus = 'pending' | 'approved' | 'declined'
export type LoanRequest = {
  id: string
  borrowerId: string
  borrowerName: string
  type: LoanType
  amount: number
  months: number
  quote: string
  comakers: Record<string, { name: string; status: CoStatus; at?: number }>
  comakerIds: string[]
  status: 'pending' | 'approved' | 'declined' | 'withdrawn' | 'paid'
  createdAt: number
  decidedAt?: number
  paidAt?: number
  /** current amount owed; starts at `amount`, grows with each carryover */
  balance?: number
  /** part of the balance that is the amount borrowed (the rest is carried-over interest) */
  principal?: number
  customPayments?: number
  carryovers?: number
  interestPayments?: number
  /** a founder borrowing above their limit (needs 2 founding co-makers) */
  overLimit?: boolean
  /** loan reference, e.g. 3FL: a number per type, coop-wide, given when the loan is approved */
  ref?: string
  /** running loan number across all types (#12) */
  no?: number
  /** for a savings loan (SL): the month whose missed savings it covers */
  carriedMonth?: number
  /** a paid Savings Loan whose carried savings were moved into savings */
  savingsSettled?: boolean
  /** a Savings Loan's 10% was added to the balance at once */
  upfront?: boolean
  /** closed by the admin without recording money (e.g. a test loan) */
  closedNoMoney?: boolean
  /** set when the admin approved without waiting for both co-makers */
  directApproval?: boolean
}

export type RequestInput = {
  borrower: Member
  borrowerId: string
  /** the member's recruiter (their one co-maker); founders have none */
  recruiterId?: string
  comakerIds: string[]
  founderIds: string[]
  /** Bryan, the admin: can't co-make an over-limit loan */
  bryanId?: string
  hasUnpaid: boolean
  /** total savings paid so far (for Loan Against Deposit) */
  savings: number
  type: LoanType
  amount: number
  months: number
  today: Date
  year: number
  hasPending: boolean
}

/** Everything the handbook and the co-maker rule require; null means the request can be sent. */
export type ComakerMode = 'none' | 'recruiter' | 'two-founders' | 'blocked'

/** Who must vouch: deposit loans and founders within the limit need nobody; members need their recruiter. */
export function comakerMode(r: { borrower: Member; amount: number; type: LoanType }): ComakerMode {
  if (r.type === 'deposit') return 'none'
  const over = r.amount > loanLimit(r.borrower.heads)
  if (r.borrower.founder) return over ? 'two-founders' : 'none'
  return over ? 'blocked' : 'recruiter'
}

export function validateRequest(r: RequestInput): string | null {
  if (r.hasPending) return 'You already have a pending request. Wait for it, or withdraw it first.'
  const left = monthsLeft(r.today, r.year)
  if (left < 1) return 'Loans are closed: nothing can be repaid by December 15 any more.'
  if (r.type === 'regular') {
    if (!(regularTerms(left) as number[]).includes(r.months)) return `A regular loan must be repaid by December 15. Choose ${regularTerms(left).join(' or ') || 'another loan type'}.`
    const q = regularLoan(r.amount, r.months as 2 | 3 | 6)
    if ('error' in q) return q.error
  } else {
    if (r.months > left) return `This loan must be repaid by December 15: ${left} month${left === 1 ? '' : 's'} at most.`
    const err = monthlyLoanError(r.type, r.amount, r.months)
    if (err) return err
  }
  if (r.type === 'deposit') {
    if (r.hasUnpaid) return 'A loan against deposit needs all your unpaid loans cleared first.'
    if (r.amount !== depositAmount(r.savings) || r.amount <= 0) return `A loan against deposit is 80% of your savings: ₱${depositAmount(r.savings).toLocaleString()}.`
  }
  const mode = comakerMode(r)
  const ids = r.comakerIds.filter(Boolean)
  if (mode === 'blocked') return `That is above your loan limit of ₱${loanLimit(r.borrower.heads).toLocaleString()}.`
  if (mode === 'none') return ids.length ? 'This loan needs no co-maker.' : null
  if (mode === 'recruiter') {
    if (!r.recruiterId || !r.founderIds.includes(r.recruiterId)) return 'Your recruiter is not on record yet. Ask the admin.'
    return ids.length === 1 && ids[0] === r.recruiterId ? null : 'Your co-maker must be your recruiter.'
  }
  if (ids.length !== 2) return 'Over your limit: choose 2 founding members as co-makers.'
  if (ids[0] === ids[1]) return 'Choose 2 different co-makers.'
  if (ids.includes(r.borrowerId)) return "You can't pick yourself as a co-maker."
  if (r.bryanId && ids.includes(r.bryanId)) return "The admin can't co-make a loan over the limit (handbook)."
  if (ids.some((id) => !r.founderIds.includes(id))) return 'Co-makers must be founding members.'
  return null
}

const coStatuses = (r: LoanRequest) => r.comakerIds.map((id) => r.comakers[id]?.status)

export const canAdminApprove = (r: LoanRequest) => r.status === 'pending' && coStatuses(r).every((s) => s === 'approved')

export function requestStage(r: LoanRequest): string {
  if (r.status === 'paid') return 'Paid'
  if (r.status === 'approved') return 'Approved'
  if (r.status === 'declined') return 'Declined'
  if (r.status === 'withdrawn') return 'Withdrawn'
  return canAdminApprove(r) ? 'Waiting for admin' : 'Waiting for co-makers'
}

/** A member's unpaid loans: app loans approved but not marked paid, plus the balance typed from the old sheet. */
/** With `current`, the total also counts each loan's interest due this period until it is paid or carried over. */
export function unpaidLoans(all: LoanRequest[], memberId: string, sheetBalance = 0, current?: { txns: Txn[]; now: number }) {
  const loans = all.filter((r) => r.borrowerId === memberId && r.status === 'approved')
  const appTotal = loans.reduce((t, r) => t + balanceOf(r), 0)
  const due = current ? cents(loans.reduce((t, r) => t + interestDueNow(r, current.txns, current.now), 0)) : 0
  return { loans, appTotal, interestDue: due, sheetBalance, total: cents(appTotal + due + sheetBalance) }
}

const PH = 8 * 3600_000 // the Philippines: UTC+8, no daylight saving
const DAY = 24 * 3600_000

export type LoanPeriod = { n: number; startsAt: number; dueAt: number; endsAt: number; last: boolean }

/**
 * A loan's interest runs month to month (Philippine time) from its approval date: approved Oct 28, period 1 is due
 * Nov 28; unpaid, it is added to the balance once Nov 28 ends. A month without that day uses its last day. December 15
 * is every loan's last due date. A Savings Loan follows its missed month instead, like savings: its upfront 10% is
 * that month's interest, and each later month's is due by that month's 7th, through December.
 */
function periodAt(r: LoanRequest, n: number): LoanPeriod {
  const s = new Date((r.decidedAt ?? r.createdAt) + PH) // Manila wall clock, read with UTC getters
  const y = s.getUTCFullYear()
  const deadline = Date.UTC(y, 11, 15) - PH
  if (r.type === 'savings' && r.carriedMonth !== undefined) {
    const seventh = (k: number) => Date.UTC(y, k, 7) - PH
    const k = r.carriedMonth + n - 1
    return { n, startsAt: seventh(k - 1) + DAY, dueAt: seventh(k), endsAt: seventh(k) + DAY, last: k >= 11 }
  }
  const m = s.getUTCMonth(), d = s.getUTCDate()
  const day = (k: number) => Date.UTC(y, m + k, Math.min(d, new Date(Date.UTC(y, m + k + 1, 0)).getUTCDate())) - PH
  const startsAt = n === 1 ? r.decidedAt ?? r.createdAt : day(n - 1) + DAY
  const dueAt = Math.min(day(n), deadline)
  return { n, startsAt, dueAt, endsAt: dueAt + DAY, last: dueAt === deadline }
}

/** Every loan is paid in full by December 15 of its year (dividends are released Dec 16). */
export function loanDeadline(r: LoanRequest) {
  return Date.UTC(new Date((r.decidedAt ?? r.createdAt) + PH).getUTCFullYear(), 11, 15) - PH
}

/** The period running at `now` (the last one, Dec 15's, once that has passed). */
export function loanPeriod(r: LoanRequest, now = Date.now()): LoanPeriod {
  let p = periodAt(r, 1)
  while (!p.last && p.endsAt <= now) p = periodAt(r, p.n + 1)
  return p
}

/** Every period whose due day has ended, oldest first (the daily carryover adds those still unpaid). */
export function endedPeriods(r: LoanRequest, now = Date.now()): LoanPeriod[] {
  const out: LoanPeriod[] = []
  for (let p = periodAt(r, 1); p.endsAt <= now; p = periodAt(r, p.n + 1)) { out.push(p); if (p.last) break }
  return out
}

/**
 * Interest to pay now, apart from what is owed: this period's for most loans. A Savings Loan has none: its 10% goes
 * straight into what is owed on each 8th, so its payments always come off that.
 */
export function interestDueNow(r: LoanRequest, txns: Txn[], now = Date.now()) {
  return r.type === 'savings' ? 0 : interestDue(r, txns, loanPeriod(r, now))
}

/** What a loan card says about interest: due now, the next 10% a Savings Loan will add, the next due date, or pay by Dec 15. */
export type InterestNext = { kind: 'due' | 'added'; amount: number; on: number } | { kind: 'next' | 'pay-by'; on: number }
export function interestNext(r: LoanRequest, txns: Txn[], now = Date.now()): InterestNext {
  const p = loanPeriod(r, now)
  const payBy = { kind: 'pay-by' as const, on: loanDeadline(r) }
  if (r.type === 'savings') return p.endsAt > now && !(p.n === 1 && p.last) ? { kind: 'added', amount: monthInterest(r), on: p.endsAt } : payBy
  const due = interestDue(r, txns, p)
  if (due > 0) return { kind: 'due', amount: due, on: p.dueAt }
  return p.last ? payBy : { kind: 'next', on: loanPeriod(r, p.endsAt).dueAt }
}

/**
 * The interest of every ended period still unpaid, added to the balance oldest first (the daily run, and after the
 * admin changes a loan's date). Null when nothing is missed.
 */
export function missedInterest(r: LoanRequest, txns: Txn[], now = Date.now()) {
  let cur = r
  const entries: { period: number; due: number; dueAt: number; balance: number }[] = []
  for (const p of endedPeriods(r, now)) {
    const due = interestDue(cur, txns, p)
    if (!(due > 0)) continue
    cur = { ...cur, ...carryover(cur, due) }
    entries.push({ period: p.n, due, dueAt: p.dueAt, balance: balanceOf(cur) })
  }
  return entries.length ? { balance: balanceOf(cur), carryovers: cur.carryovers ?? 0, entries } : null
}

/**
 * A period's interest still to pay: nothing once Pay interest (or a custom payment's interest part) covers it, or
 * once it is carried over into the balance. Entries count by their `period` tag, or (older ones) by their date.
 */
export function interestDue(r: LoanRequest, txns: Txn[], p: LoanPeriod) {
  // a Savings Loan's 10% added upfront is its first month's interest
  if (r.type === 'savings' && r.upfront && p.n === 1) return 0
  const inPeriod = (t: Txn) => (t.period !== undefined ? t.period === p.n : t.createdAt >= p.startsAt && t.createdAt < p.endsAt)
  const mine = txns.filter((t) => t.loanId === r.id && !t.voidedAt && inPeriod(t))
  // a loan carryover; not the carry-over mark that created a Savings Loan (its loan was not approved yet)
  if (mine.some((t) => t.carryover && t.loanBefore?.status === 'approved')) return 0
  // a Savings Loan's 10% is added on each 8th until the missed savings are paid in full; paying interest only
  // brings the balance down, it doesn't stop the next month's 10%
  if (r.type === 'savings') return monthInterest(r)
  const paid = mine.filter((t) => t.kind === 'interest').reduce((sum, t) => sum + t.amount, 0)
  return cents(Math.max(0, monthInterest(r) - paid))
}

const cents = (x: number) => Math.round(x * 100) / 100
export const balanceOf = (r: LoanRequest) => r.balance ?? r.amount

/**
 * One month's interest on the current balance (monthly-rate loans; regular loans are flat-rate instalments).
 * A Savings Loan is the exception: always 10% of the missed savings still owed, never of the upfront or carried interest.
 */
export const monthInterest = (r: LoanRequest) =>
  r.type === 'regular' ? 0 : cents((r.type === 'savings' ? principalOf(r) : balanceOf(r)) * MONTHLY_LOANS[r.type].rate)

/** Carryover: this month's interest still due (`due`) is added to the balance. */
export const carryover = (r: LoanRequest, due = monthInterest(r)) => ({ balance: cents(balanceOf(r) + due), carryovers: (r.carryovers ?? 0) + 1 })

/**
 * Pay interest. With interest due this month (`due`), that is what's paid and the balance stays. With none due
 * (a Savings Loan's first month, whose 10% was added upfront, or a month already carried over), a month's interest
 * sitting in the balance is paid off it: ₱6,600 owed becomes ₱6,000. `collected` 0 means nothing to pay.
 */
export function payInterest(r: LoanRequest, due = monthInterest(r)) {
  const interestPayments = (r.interestPayments ?? 0) + 1
  if (due > 0) return { collected: due, update: { balance: balanceOf(r), interestPayments } }
  const carried = Math.max(0, balanceOf(r) - principalOf(r))
  // once nothing more accrues (a Savings Loan whose savings are paid back), all the interest left is paid at once
  const inBalance = cents(monthInterest(r) > 0 ? Math.min(monthInterest(r), carried) : carried)
  return { collected: inBalance, update: { balance: cents(balanceOf(r) - inBalance), interestPayments } }
}

export const principalOf = (r: LoanRequest) => r.principal ?? r.amount

/**
 * Pay For Savings: the member pays back a Savings Loan's missed savings. They count as saved for that month (the
 * caller records them, settled), the interest stays owed, and the loan closes if nothing else is owed. Null when
 * there is nothing to pay back.
 */
export function savingsPayback(r: LoanRequest) {
  const amount = r.type === 'savings' ? cents(principalOf(r)) : 0
  if (!(amount > 0)) return null
  const balance = cents(Math.max(0, balanceOf(r) - amount))
  return { amount, update: { balance, principal: 0, savingsSettled: true, ...(balance <= 0 ? { status: 'paid' as const } : {}) } }
}

/** Interest collected when a loan is fully paid: carried-over interest, plus a regular loan's flat interest. */
export function settleInterest(r: LoanRequest): number {
  const carried = Math.max(0, balanceOf(r) - principalOf(r))
  if (r.type !== 'regular') return cents(carried)
  const q = regularLoan(r.amount, r.months as 2 | 3 | 6)
  return cents(carried + ('error' in q ? 0 : q.interest))
}

export type CustomPayment =
  | { interestPart: number; collected: number; balance: number; principal: number; paidOff: boolean }
  | { error: string }

/**
 * Any amount the borrower pays this month (e.g. ₱500). It covers this month's interest first, then interest
 * carried over earlier, then the amount borrowed. Paying less than the interest carries the shortfall over.
 * `due` is this month's interest still unpaid (none once paid, or once it is already in the balance).
 */
export function customPayment(r: LoanRequest, paid: number, due = monthInterest(r)): CustomPayment {
  const balance = balanceOf(r)
  const owed = cents(balance + due)
  if (!(paid > 0)) return { error: 'Enter the amount paid.' }
  if (paid > owed + 0.001) return { error: `That's more than is owed (₱${owed.toLocaleString('en-PH', { maximumFractionDigits: 2 })}).` }
  const interestPart = cents(Math.min(paid, due))
  const shortfall = cents(due - interestPart)
  let rest = cents(paid - interestPart)
  const toCarried = Math.min(rest, Math.max(0, cents(balance - principalOf(r))))
  rest = cents(rest - toCarried)
  const newBalance = cents(balance + shortfall - (paid - interestPart))
  return {
    interestPart, collected: cents(interestPart + toCarried),
    balance: Math.max(0, newBalance), principal: cents(principalOf(r) - rest), paidOff: newBalance <= 0.001,
  }
}

/** A loan's state before an admin action, saved on its transaction so a void can put it back. */
export const loanSnapshot = (r: LoanRequest) => ({
  status: r.status, balance: balanceOf(r), principal: principalOf(r), ...(r.savingsSettled ? { savingsSettled: true } : {}),
  carryovers: r.carryovers ?? 0, interestPayments: r.interestPayments ?? 0, customPayments: r.customPayments ?? 0,
  ...(r.paidAt ? { paidAt: r.paidAt } : {}), ...(r.decidedAt ? { decidedAt: r.decidedAt } : {}),
})
export type LoanSnapshot = ReturnType<typeof loanSnapshot>

/** Two-letter reference code per loan type (the coop sheet used FL/RL/HL/S). */
export const LOAN_CODE: Record<LoanType, string> = {
  flex: 'FL', savings: 'SL', regular: 'RL', grocery: 'GL', appliance: 'AL', events: 'HL', deposit: 'DL',
}

/**
 * The next loan reference for a member, e.g. 13SL #14: the member's 13th loan this cycle, a Savings Loan, and the
 * coop's 14th approved loan this cycle. Both counts start again at 1 each cycle (the counters doc is per cycle).
 */
export function nextRef(counters: Record<string, number>, type: LoanType, memberId: string) {
  const mine = (counters[`M_${memberId}`] ?? 0) + 1
  const no = (counters.ALL ?? 0) + 1
  return { ref: `${mine}${LOAN_CODE[type]}`, no, counters: { ...counters, ALL: no, [`M_${memberId}`]: mine } }
}

/** How a loan is named everywhere: "1SL #12". */
export const refLabel = (r: { ref?: string; no?: number }) => (r.ref ? `${r.ref}${r.no ? ` #${r.no}` : ''}` : '')

/** Missed savings carried over: an approved 10%-a-month loan, no co-maker, no request step. */
export function savingsLoan(p: { borrowerId: string; borrowerName: string; amount: number; month: number; ref: string; now: number }): Omit<LoanRequest, 'id'> {
  return {
    borrowerId: p.borrowerId, borrowerName: p.borrowerName, type: 'savings', amount: p.amount, months: 1,
    quote: '10% a month until paid', comakers: {}, comakerIds: [], status: 'approved',
    createdAt: p.now, decidedAt: p.now, ref: p.ref, carriedMonth: p.month,
    // the 10% is added at once: ₱6,000 carried over is ₱6,600 owed; each month after is 10% of the ₱6,000
    balance: cents(p.amount * 1.1), principal: p.amount, upfront: true,
  }
}

/** An older Savings Loan made before the 10% was added upfront: the one-time correction, or null. */
export function upfrontFix(r: LoanRequest) {
  if (r.type !== 'savings' || r.upfront) return null
  const added = cents(r.amount * 0.1)
  return { balance: cents(balanceOf(r) + added), upfront: true as const, added }
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Which month a loan belongs to: a Savings Loan's covered month, else the month it was approved (or asked for). */
export function loanMonth(r: LoanRequest): string {
  if (r.type === 'savings' && r.carriedMonth !== undefined) return `${MONTH_ABBR[r.carriedMonth]} savings`
  if (r.status === 'pending' || r.status === 'withdrawn' || !r.decidedAt) return `${MONTH_ABBR[new Date(r.createdAt).getMonth()]} request`
  return `${MONTH_ABBR[new Date(r.decidedAt).getMonth()]} loan`
}
