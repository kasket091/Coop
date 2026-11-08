import { useState } from 'react'
import { peso } from './format'
import type { LoanType } from './requests'
import { loanLimit, MONTHLY_LOANS, monthlyLoan, monthlyLoanError, monthsLeft, regularLoan, regularTerms, type Member, type MonthlyLoanType } from './rules'

// Labels stay short enough for a 343px select; the conditions show under the field.
export const TYPES: Record<LoanType, string> = {
  regular: 'Regular',
  flex: 'Flex (8% a month)',
  grocery: 'Grocery – Tindamarts (5%)',
  appliance: 'Appliance / device (5%)',
  events: 'Special Events (8%)',
  deposit: 'Loan Against Deposit (7%)',
}
export const CONDITIONS: Record<keyof typeof TYPES, string> = {
  regular: '₱10,000–₱50,000 for 2 or 3 months; ₱20,000–₱75,000 for 6 months.',
  flex: '7% instead of 8% if paid back within 15 days.',
  grocery: 'Minimum ₱2,000.',
  appliance: 'At least 2 months. Proof of receipt required.',
  events: 'Board members only.',
  deposit: '80% of your savings, no co-maker. Only when you have no unpaid loans.',
}

/** Months a loan of this type may run today: up to December 15 of the cycle year. */
export function termOptions(type: LoanType, today: Date, year: number): number[] {
  const left = monthsLeft(today, year)
  if (type === 'regular') return [...regularTerms(left)]
  return Array.from({ length: left }, (_, i) => i + 1).filter((n) => n >= (MONTHLY_LOANS[type].minMonths ?? 1))
}

/** One-line summary saved with a loan request, so the admin sees what the borrower was quoted. */
export function quoteText(type: LoanType, amount: number, months: number): string {
  if (type === 'regular') {
    const q = regularLoan(amount, months as 2 | 3 | 6)
    return 'error' in q ? q.error : `${peso(q.installment)} a month for ${months} months, ${peso(q.total)} total`
  }
  const q = monthlyLoan(amount, MONTHLY_LOANS[type].rate, months)
  return `${peso(amount + q.paidMonthly)} total if interest is paid monthly (${months} month${months === 1 ? '' : 's'})`
}

export function Calculator({ member, year }: { member: Member | null; year: number }) {
  const [type, setType] = useState<LoanType>('flex')
  const [amount, setAmount] = useState('20000')
  const [months, setMonths] = useState(1)
  const capital = Number(amount.replace(/[^\d.]/g, '')) || 0
  const options = termOptions(type, new Date(), year)
  const term = options.includes(months) ? months : options[0]

  return (
    <section>
      <h1 style={{ fontSize: 22 }}>Loan calculator</h1>
      {member && <p className="plan">Your limit this year: {peso(loanLimit(member.heads))} ({member.heads} heads × ₱8,000)</p>}
      <div className="field">
        <label htmlFor="type">Loan type</label>
        <select id="type" value={type} onChange={(e) => setType(e.target.value as LoanType)}>
          {Object.entries(TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <p className="note" style={{ marginTop: 0 }}>{CONDITIONS[type]}</p>
      </div>
      <div className="field">
        <label htmlFor="amt">Amount (₱)</label>
        <input id="amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="term">Months</label>
        <select id="term" value={term ?? ''} onChange={(e) => setMonths(Number(e.target.value))} disabled={!options.length}>
          {!options.length && <option value="">None left this year</option>}
          {options.map((n) => <option key={n} value={n}>{n} {n === 1 ? 'month' : 'months'}</option>)}
        </select>
      </div>
      {member && capital > loanLimit(member.heads) && <p className="alert" role="status">That is above your {peso(loanLimit(member.heads))} limit. Board approval is needed to go higher.</p>}
      {!options.length ? <p className="alert" role="status">This loan can't be repaid by December 15 any more. {type === 'regular' ? 'Try a monthly-rate loan.' : 'Loans reopen next cycle.'}</p>
        : type === 'regular' ? <RegularQuote capital={capital} months={term as 2 | 3 | 6} /> : <MonthlyQuote type={type} capital={capital} months={term} />}
    </section>
  )
}

function RegularQuote({ capital, months }: { capital: number; months: 2 | 3 | 6 }) {
  const q = regularLoan(capital, months)
  if ('error' in q) return <p className="alert" role="status">{q.error}</p>
  return (
    <div className="quote">
      <p className="note">Pay each month</p>
      <div className="big">{peso(q.installment)}</div>
      <ul className="rows panel" style={{ marginTop: 14 }}>
        <li><span>Each month, for {months} months</span><b>{peso(capital / months)} + {peso(q.interest / months)} interest</b></li>
        <li><span>Total interest</span><b>{peso(q.interest)}</b></li>
        <li><span>Total to repay</span><b>{peso(q.total)}</b></li>
      </ul>
      <p className="note">{(q.rate * 100).toFixed(1).replace('.0', '')}% a month, flat on the original amount. A late payment adds a 1% penalty.</p>
    </div>
  )
}

function MonthlyQuote({ type, capital, months }: { type: MonthlyLoanType; capital: number; months: number }) {
  const err = monthlyLoanError(type, capital, months)
  if (err) return <p className="alert" role="status">{err}</p>
  const flex = type === 'flex'
  const q = monthlyLoan(capital, MONTHLY_LOANS[type].rate, months)
  return (
    <div className="quote">
      <ul className="rows panel">
        {flex && <li><span>Paid back within 15 days (7%)</span><b>{peso(capital * 1.07)}</b></li>}
        <li><span>Interest each month</span><b>{peso(capital * MONTHLY_LOANS[type].rate)}</b></li>
        <li><span>Total interest if paid monthly</span><b>{peso(q.paidMonthly)}</b></li>
        <li><span>Owed if nothing is paid until month {months}</span><b>{peso(capital + q.unpaid)}</b></li>
      </ul>
      <p className="note">Unpaid interest is added to the balance each month, so waiting costs more. Everything must be repaid by December 15.</p>
    </div>
  )
}

const CHANNELS = [
  { name: 'BPI', number: '9336367402' },
  { name: 'GCash', number: '09499974143' },
  { name: 'Maya', number: '09499974143' },
]

export function PayRules() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (name: string, n: string) =>
    navigator.clipboard?.writeText(n).then(() => { setCopied(name); setTimeout(() => setCopied(null), 1500) }, () => setCopied(null))

  return (
    <section>
      <h1 style={{ fontSize: 22 }}>How to pay</h1>
      <p className="plan">All accounts are under Bryan Kevin Tabuan.</p>
      <div className="panel" style={{ marginTop: 14 }}>
        {CHANNELS.map((c) => (
          <div className="channel" key={c.name}>
            <div><b>{c.name}</b><span>{c.number}</span></div>
            <button className="copy" onClick={() => copy(c.name, c.number)} aria-label={`Copy ${c.name} number`}>
              {copied === c.name ? 'Copied' : 'Copy'}
            </button>
          </div>
        ))}
        <div className="channel"><div><b>Cash</b><span>Victors Subdivision, Carmen/Canitoan, CDO. Message Bryan first.</span></div></div>
      </div>
      <p className="fine" style={{ marginTop: 8 }}>Transfer fees between BPI, GCash and Maya (₱10–₱15) are paid by the member.</p>

      <div className="section">
        <h2>Key rules</h2>
        <ul className="rules">
          <li>Savings are due from the 1st to the 7th of every month.</li>
          <li>Your number of heads is locked from January to December (₱500 per head).</li>
          <li>A missed month becomes a loan at 10% a month.</li>
          <li>Everyone takes at least one loan a year: ₱10,000 (1–4 heads), ₱20,000 (5–7), ₱30,000 (8 or more).</li>
          <li>Loan requests are taken from 8 AM to 8 PM, except in emergencies.</li>
          <li>All loans must be repaid by December 15. Savings and dividends are released December 16–19.</li>
          <li>Leaving early costs a 20% termination fee on your savings.</li>
        </ul>
      </div>
      <p className="tagline">Save Together, Help Each Other, Share the Rewards.</p>
    </section>
  )
}
