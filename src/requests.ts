import { loanLimit, MONTHLY_LOANS, monthlyLoanError, monthsLeft, regularLoan, regularTerms, type Member, type MonthlyLoanType } from './rules'

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
  carryovers?: number
  interestPayments?: number
  /** set when the admin approved without waiting for both co-makers */
  directApproval?: boolean
}

export type RequestInput = {
  borrower: Member
  borrowerId: string
  comakerIds: string[]
  founderIds: string[]
  type: LoanType
  amount: number
  months: number
  today: Date
  year: number
  hasPending: boolean
}

/** Everything the handbook and the co-maker rule require; null means the request can be sent. */
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
  if (r.amount > loanLimit(r.borrower.heads)) return `That is above your loan limit of ₱${loanLimit(r.borrower.heads).toLocaleString()}.`
  if (r.comakerIds.length !== 2 || r.comakerIds.some((id) => !id)) return 'Choose 2 co-makers.'
  if (r.comakerIds[0] === r.comakerIds[1]) return 'Choose 2 different co-makers.'
  if (r.comakerIds.includes(r.borrowerId)) return "You can't pick yourself as a co-maker."
  if (r.comakerIds.some((id) => !r.founderIds.includes(id))) return 'Co-makers must be founding members.'
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

/** When a loan is fully paid, any carried-over interest in the balance is interest collected. */
export const settleInterest = (r: LoanRequest) => cents(Math.max(0, balanceOf(r) - r.amount))
