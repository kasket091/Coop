import type { ReactNode } from 'react'
import { MONTHS, peso } from './format'
import { IconAlert, IconCheck } from './icons'
import { closedMonths, loanLimit, memberSummary, minAnnualLoan, missedOwed, type CoopSummary, type Member } from './rules'
import type { Summary } from './store'
import { terminationPayout } from './termination'

/** One member's locked year. Used by the member's Savings tab and the admin's member view. */
export function MySavings({ m, coop, year, action, extra, termination, onMonth }: {
  m: Member; coop: CoopSummary; year: number; action?: ReactNode; extra?: ReactNode
  /** when set, each month is a button (the admin jumps to that month's transactions) */
  onMonth?: (month: number) => void
  /** set when the account is terminated: the reason, the figures saved at termination, and any loans still owed */
  termination?: { reason: string; unpaid: number; saved?: number; fee?: number; loansDeducted?: number; payout?: number; stillOwed?: number }
}) {
  const today = new Date()
  const s = memberSummary(m, coop, today, year)
  const closed = closedMonths(today, year)
  const owed = s.missed.filter((i) => !((m.carried?.[i] ?? 0) > 0)).reduce((t, i) => t + missedOwed(s.monthlyDue - m.paid[i], closed - i), 0)
  const isCarried = (i: number) => (m.carried?.[i] ?? 0) > 0
  const missed = s.missed.filter((i) => !isCarried(i)) // carried months are already a Savings Loan, not a separate debt
  const state = (i: number) => (m.paid[i] >= s.monthlyDue ? 'paid' : isCarried(i) ? 'carried' : missed.includes(i) ? 'missed' : i === closed ? 'due' : 'open')

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
          const label = `${mo}: ${st === 'open' ? 'upcoming' : st === 'due' ? 'next due, 1st to 7th' : st === 'carried' ? 'carried over to a Savings Loan' : st}`
          const body = <>{mo}{st === 'paid' && <IconCheck />}{(st === 'missed' || st === 'carried') && <IconAlert />}</>
          return (
            <li key={mo} className={`cell ${st}`} aria-label={onMonth ? undefined : label}>
              {onMonth ? <button className="cell-btn" onClick={() => onMonth(i)} aria-label={`${label}. Show ${mo} transactions`}>{body}</button> : body}
            </li>
          )
        })}
      </ol>
      <div className="legend" aria-hidden="true">
        <span><i style={{ background: 'var(--navy)' }} />Paid</span>
        <span><i style={{ background: 'var(--red)' }} />Missed</span>
        <span><i style={{ border: '2px dashed var(--navy)' }} />Next due (1st–7th)</span>
        {m.carried?.some((c) => c > 0) && <span><i style={{ background: '#f4c7c3', border: '1px solid var(--red)' }} />Carried over (Savings Loan)</span>}
      </div>

      {missed.length > 0 && (
        <div className="alert" role="status">
          <h2>{missed.length === 1 ? '1 missed month' : `${missed.length} missed months`}: {missed.map((i) => MONTHS[i]).join(', ')}</h2>
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

      {termination ? <TerminationCard live={s.saved} {...termination} /> : <div className="payout">
        <h2>December payout (projected)</h2>
        <div className="big">{peso(s.payout)}</div>
        <p>{peso(s.target)} savings + {peso(s.dividend)} dividend{s.rebate > 0 ? ` + ${peso(s.rebate)} top-borrower rebate` : ''}</p>
        <p>Assumes all 12 months are paid. Released Dec 16–19.</p>
      </div>}
    </section>
  )
}

function TerminationCard({ live, reason, unpaid, ...frozen }: {
  live: number; reason: string; unpaid: number; saved?: number; fee?: number; loansDeducted?: number; payout?: number; stillOwed?: number
}) {
  // total savings now (Savings Loans paid at termination count as saved); the fee is 20% of it; the loans deducted
  // are the ones paid from savings at termination (older terminations work them out live); the payout is what's left
  const fee = Math.round(live * 0.2 * 100) / 100
  const t = frozen.loansDeducted !== undefined
    ? { saved: live, fee, loansDeducted: frozen.loansDeducted, payout: Math.max(0, Math.round((live - fee - frozen.loansDeducted) * 100) / 100), stillOwed: frozen.stillOwed ?? unpaid }
    : terminationPayout(live, unpaid)
  return (
    <div className="terminated">
      <h2>Account terminated</h2>
      <p className="reason">{reason}</p>
      <ul className="rows">
        <li><span>Total savings</span><b>{peso(t.saved)}</b></li>
        <li><span>Less 20% termination fee</span><b>−{peso(t.fee)}</b></li>
        <li><span>Less unpaid loans (paid from savings, now closed)</span><b>−{peso(t.loansDeducted)}</b></li>
        <li className="final"><span>Termination payout</span><b>{peso(t.payout)}</b></li>
        {t.stillOwed > 0 && <li className="owed"><span>Still owed to the coop</span><b>{peso(t.stillOwed)}</b></li>}
      </ul>
      <p className="note">No projected dividend and no new loans while the account is terminated. Talk to the admin if this is wrong.</p>
    </div>
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
