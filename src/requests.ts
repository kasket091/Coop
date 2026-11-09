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
export function unpaidLoans(all: LoanRequest[], memberId: string, sheetBalance = 0) {
  const loans = all.filter((r) => r.borrowerId === memberId && r.status === 'approved')
  const appTotal = loans.reduce((t, r) => t + balanceOf(r), 0)
  return { loans, appTotal, sheetBalance, total: appTotal + sheetBalance }
}

const cents = (x: number) => Math.round(x * 100) / 100
export const balanceOf = (r: LoanRequest) => r.balance ?? r.amount

/** One month's interest on the current balance (monthly-rate loans; regular loans are flat-rate instalments). */
export const monthInterest = (r: LoanRequest) =>
  r.type === 'regular' ? 0 : cents(balanceOf(r) * MONTHLY_LOANS[r.type].rate)

/** Carryover: this month's interest is added to the balance; next month's interest is charged on the new balance. */
export const carryover = (r: LoanRequest) => ({ balance: cents(balanceOf(r) + monthInterest(r)), carryovers: (r.carryovers ?? 0) + 1 })

/** Pay interest: the borrower pays this month's interest; the balance stays. `collected` goes to the interest ledger. */
export const payInterest = (r: LoanRequest) => ({
  collected: monthInterest(r),
  update: { balance: balanceOf(r), interestPayments: (r.interestPayments ?? 0) + 1 },
})

export const principalOf = (r: LoanRequest) => r.principal ?? r.amount

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
 */
export function customPayment(r: LoanRequest, paid: number): CustomPayment {
  const due = monthInterest(r)
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
  status: r.status, balance: balanceOf(r), principal: principalOf(r),
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
    // the 10% is added at once: ₱6,000 carried over is ₱6,600 owed; next month is charged on ₱6,600
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
