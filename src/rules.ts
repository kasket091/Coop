// HILAS Coop 2026 handbook rules. Every money number the app shows comes from here.

export type Member = { id: number; name: string; heads: number; paid: number[]; interest: number[] }

export const PER_HEAD = 500
const CYCLE_YEAR = 2026
const DUE_DAY = 7

const cents = (x: number) => Math.round(x * 100) / 100
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export const monthlyDue = (heads: number) => heads * PER_HEAD

// Max loan = heads × 500 × 12 + heads × ₱2,000 prospective dividend (handbook p.5)
export const loanLimit = (heads: number) => heads * PER_HEAD * 12 + heads * 2000

export const minAnnualLoan = (heads: number) => (heads <= 4 ? 10000 : heads <= 7 ? 20000 : 30000)

/** Months of the cycle whose 1st–7th payment window has passed. */
export function closedMonths(today: Date): number {
  const y = today.getFullYear()
  if (y < CYCLE_YEAR) return 0
  if (y > CYCLE_YEAR) return 12
  return today.getMonth() + (today.getDate() > DUE_DAY ? 1 : 0)
}

export function missedMonths(m: Member, today: Date): number[] {
  const due = monthlyDue(m.heads)
  const out: number[] = []
  for (let i = 0; i < closedMonths(today); i++) if (due > 0 && m.paid[i] < due) out.push(i)
  return out
}

/** A missed contribution is a borrowed amount at 10%/month, capitalized monthly (handbook p.8). */
export const missedOwed = (amount: number, months: number) => cents(amount * 1.1 ** months)

export type CoopSummary = {
  totalHeads: number
  totalSavings: number
  totalInterest: number
  top: { name: string; interest: number; rebate: number } | null
  dividendPerHead: number
}

export function coopSummary(members: Member[]): CoopSummary {
  const totalHeads = sum(members.map((m) => m.heads))
  const totalSavings = cents(sum(members.map((m) => sum(m.paid))))
  const totalInterest = cents(sum(members.map((m) => sum(m.interest))))
  let top: CoopSummary['top'] = null
  for (const m of members) {
    const interest = cents(sum(m.interest))
    if (interest > 0 && (!top || interest > top.interest)) top = { name: m.name, interest, rebate: interest * 0.03 }
  }
  const dividendPerHead = totalHeads ? (totalInterest - (top?.rebate ?? 0)) / totalHeads : 0
  return { totalHeads, totalSavings, totalInterest, top, dividendPerHead }
}

export type MemberSummary = {
  monthlyDue: number; saved: number; target: number; missed: number[]
  dividend: number; rebate: number; payout: number
}

export function memberSummary(m: Member, coop: CoopSummary, today: Date): MemberSummary {
  const target = monthlyDue(m.heads) * 12
  const dividend = cents(m.heads * coop.dividendPerHead)
  const rebate = coop.top?.name === m.name ? cents(coop.top.rebate) : 0
  return {
    monthlyDue: monthlyDue(m.heads),
    saved: sum(m.paid),
    target,
    missed: missedMonths(m, today),
    dividend,
    rebate,
    payout: cents(target + dividend + rebate),
  }
}

const REGULAR = { 2: { rate: 0.06, min: 10000, max: 50000 }, 3: { rate: 0.055, min: 10000, max: 50000 }, 6: { rate: 0.05, min: 20000, max: 75000 } } as const

export type RegularQuote = { rate: number; interest: number; installment: number; total: number } | { error: string }

/** Regular loan: flat rate on the original capital for every month (handbook p.7, p.9). */
export function regularLoan(capital: number, months: 2 | 3 | 6): RegularQuote {
  const t = REGULAR[months]
  if (capital < 10000) return { error: 'Below ₱10,000 is treated as a Flex loan.' }
  if (capital < t.min || capital > t.max) return { error: `${months}-month loans are ₱${t.min.toLocaleString()}–₱${t.max.toLocaleString()}.` }
  const interest = cents(capital * t.rate * months)
  return { rate: t.rate, interest, installment: cents((capital + interest) / months), total: cents(capital + interest) }
}

export type MonthlyLoanType = 'flex' | 'grocery' | 'appliance' | 'events'
export const MONTHLY_LOANS: Record<MonthlyLoanType, { rate: number; minAmount?: number; minMonths?: number }> = {
  flex: { rate: 0.08 },
  grocery: { rate: 0.05, minAmount: 2000 },
  appliance: { rate: 0.05, minMonths: 2 },
  events: { rate: 0.08 },
}

/** Handbook p.7 limits for monthly-rate loans; null when the quote is allowed. */
export function monthlyLoanError(type: MonthlyLoanType, capital: number, months: number): string | null {
  const t = MONTHLY_LOANS[type]
  if (capital <= 0) return 'Enter an amount.'
  if (t.minAmount && capital < t.minAmount) return `The minimum for this loan is ₱${t.minAmount.toLocaleString()}.`
  if (t.minMonths && months < t.minMonths) return `This loan runs at least ${t.minMonths} months.`
  return null
}

/** Total interest if interest is paid every month vs. if nothing is paid and it capitalizes. */
export function monthlyLoan(capital: number, rate: number, months: number) {
  return { paidMonthly: cents(capital * rate * months), unpaid: cents(capital * (1 + rate) ** months - capital) }
}
