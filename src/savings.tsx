import type { ReactNode } from 'react'
import { MONTHS, peso } from './format'
import { IconAlert, IconCheck } from './icons'
import { closedMonths, loanLimit, memberSummary, minAnnualLoan, missedOwed, type CoopSummary, type Member } from './rules'
import type { Summary } from './store'

/** One member's locked year. Used by the member's Savings tab and the admin's member view. */
export function MySavings({ m, coop, year, action, extra }: { m: Member; coop: CoopSummary; year: number; action?: ReactNode; extra?: ReactNode }) {
  const today = new Date()
  const s = memberSummary(m, coop, today, year)
  const closed = closedMonths(today, year)
  const owed = s.missed.reduce((t, i) => t + missedOwed(s.monthlyDue - m.paid[i], closed - i), 0)
  const state = (i: number) => (m.paid[i] >= s.monthlyDue ? 'paid' : s.missed.includes(i) ? 'missed' : i === closed ? 'due' : 'open')

  return (
    <section>
      <div className="who">
        <h1>{m.name}</h1>
        {action}
      </div>
      <p className="plan">{m.heads} heads · {peso(s.monthlyDue)} a month · locked until December</p>
      {extra}

      <div className="saved">
        <div className="big">{peso(s.saved)}</div>
        <p>saved of {peso(s.target)} due by December</p>
      </div>

      <ol className="year-strip" aria-label="Contributions by month">
        {MONTHS.map((mo, i) => {
          const st = state(i)
          return (
            <li key={mo} className={`cell ${st}`} aria-label={`${mo}: ${st === 'open' ? 'upcoming' : st === 'due' ? 'next due, 1st to 7th' : st}`}>
              {mo}
              {st === 'paid' && <IconCheck />}
              {st === 'missed' && <IconAlert />}
            </li>
          )
        })}
      </ol>
      <div className="legend" aria-hidden="true">
        <span><i style={{ background: 'var(--navy)' }} />Paid</span>
        <span><i style={{ background: 'var(--red)' }} />Missed</span>
        <span><i style={{ border: '2px dashed var(--navy)' }} />Next due (1st–7th)</span>
      </div>

      {s.missed.length > 0 && (
        <div className="alert" role="status">
          <h2>{s.missed.length === 1 ? '1 missed month' : `${s.missed.length} missed months`}: {s.missed.map((i) => MONTHS[i]).join(', ')}</h2>
          <p>Missed savings become a loan at 10% a month, added to the balance. Paying today costs about <b>{peso(owed)}</b>.</p>
        </div>
      )}

      <div className="section">
        <h2>Borrowing this year</h2>
        <ul className="rows panel">
          <li><span>Loan limit</span><b>{peso(loanLimit(m.heads))}</b></li>
          <li><span>Required minimum loan</span><b>{peso(minAnnualLoan(m.heads))}</b></li>
        </ul>
      </div>

      <div className="payout">
        <h2>December payout (projected)</h2>
        <div className="big">{peso(s.payout)}</div>
        <p>{peso(s.target)} savings + {peso(s.dividend)} dividend{s.rebate > 0 ? ` + ${peso(s.rebate)} top-borrower rebate` : ''}</p>
        <p>Assumes all 12 months are paid. Released Dec 16–19.</p>
      </div>
    </section>
  )
}

/** Coop-wide totals, with no member names (members can't see each other). */
export function CoopSection({ summary }: { summary: Summary | null }) {
  if (!summary) return <p className="note section">Coop totals appear once the admin publishes them.</p>
  return (
    <div className="section">
      <h2>The coop this year</h2>
      <ul className="rows panel">
        <li><span>Members</span><b>{summary.members}</b></li>
        <li><span>Heads</span><b>{summary.totalHeads}</b></li>
        <li><span>Savings collected</span><b>{peso(summary.totalSavings)}</b></li>
        <li><span>Interest collected</span><b>{peso(summary.totalInterest)}</b></li>
        <li><span>Dividend per head (projected)</span><b>{peso(summary.dividendPerHead)}</b></li>
        {summary.rebate > 0 && <li><span>Top-borrower rebate (3%)</span><b>{peso(summary.rebate)}</b></li>}
      </ul>
    </div>
  )
}
