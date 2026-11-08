import { useState } from 'react'
import { peso } from './format'
import { loanLimit, monthlyLoan, regularLoan, type CoopSummary, type Member } from './rules'

export function Coop({ coop, members }: { coop: CoopSummary; members: Member[] }) {
  const active = members.filter((m) => m.heads > 0).length
  return (
    <section>
      <h1 style={{ fontSize: 22 }}>The coop this year</h1>
      <div className="section">
        <ul className="rows panel">
          <li><span>Members</span><b>{active}</b></li>
          <li><span>Heads</span><b>{coop.totalHeads}</b></li>
          <li><span>Savings collected</span><b>{peso(coop.totalSavings)}</b></li>
          <li><span>Interest collected</span><b>{peso(coop.totalInterest)}</b></li>
        </ul>
      </div>
      <div className="payout">
        <h2>Dividend per head (projected)</h2>
        <div className="big">{peso(coop.dividendPerHead)}</div>
        <p>(Interest − top-borrower rebate) ÷ {coop.totalHeads} heads. Final figure is computed in December.</p>
      </div>
      {coop.top && (
        <div className="section">
          <h2>Top borrower so far</h2>
          <ul className="rows panel">
            <li><span>{coop.top.name}</span><b>{peso(coop.top.interest)} interest</b></li>
            <li><span>3% rebate</span><b>{peso(coop.top.rebate)}</b></li>
          </ul>
        </div>
      )}
    </section>
  )
}

const TYPES = {
  regular: { label: 'Regular loan (flat rate)', rate: 0 },
  flex: { label: 'Flex loan (8% a month)', rate: 0.08 },
  grocery: { label: 'Grocery – Tindamarts (5% a month)', rate: 0.05 },
  appliance: { label: 'Appliances / devices (5% a month)', rate: 0.05 },
  events: { label: 'HILAS Special Events – board only (8%)', rate: 0.08 },
} as const
type LoanType = keyof typeof TYPES

export function Loans({ member }: { member: Member | null }) {
  const [type, setType] = useState<LoanType>('regular')
  const [amount, setAmount] = useState('20000')
  const [months, setMonths] = useState(3)
  const capital = Number(amount.replace(/[^\d.]/g, '')) || 0
  const termOptions = type === 'regular' ? [2, 3, 6] : [1, 2, 3, 4, 5, 6]
  const term = termOptions.includes(months) ? months : termOptions[0]

  return (
    <section>
      <h1 style={{ fontSize: 22 }}>Loan calculator</h1>
      {member && <p className="plan">Your limit this year: {peso(loanLimit(member.heads))} ({member.heads} heads × ₱8,000)</p>}
      <div className="field">
        <label htmlFor="type">Loan type</label>
        <select id="type" value={type} onChange={(e) => setType(e.target.value as LoanType)}>
          {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="amt">Amount (₱)</label>
        <input id="amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="term">Months</label>
        <select id="term" value={term} onChange={(e) => setMonths(Number(e.target.value))}>
          {termOptions.map((n) => <option key={n} value={n}>{n} {n === 1 ? 'month' : 'months'}</option>)}
        </select>
      </div>
      {member && capital > loanLimit(member.heads) && <p className="alert" role="status">That is above your {peso(loanLimit(member.heads))} limit. Board approval is needed to go higher.</p>}
      {type === 'regular' ? <RegularQuote capital={capital} months={term as 2 | 3 | 6} /> : <MonthlyQuote capital={capital} rate={TYPES[type].rate} months={term} flex={type === 'flex'} />}
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
      <table className="panel" style={{ marginTop: 14 }}>
        <thead><tr><th>Month</th><th>Capital</th><th>Interest</th><th>Payable</th></tr></thead>
        <tbody>
          {Array.from({ length: months }, (_, i) => (
            <tr key={i}><td>{i + 1}</td><td>{peso(capital / months)}</td><td>{peso(q.interest / months)}</td><td>{peso(q.installment)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td>Total</td><td>{peso(capital)}</td><td>{peso(q.interest)}</td><td>{peso(q.total)}</td></tr></tfoot>
      </table>
      <p className="note">{(q.rate * 100).toFixed(1).replace('.0', '')}% a month, flat on the original amount. A late payment adds a 1% penalty.</p>
    </div>
  )
}

function MonthlyQuote({ capital, rate, months, flex }: { capital: number; rate: number; months: number; flex: boolean }) {
  if (capital <= 0) return <p className="note">Enter an amount.</p>
  const q = monthlyLoan(capital, rate, months)
  return (
    <div className="quote">
      <ul className="rows panel">
        {flex && <li><span>Paid back within 15 days (7%)</span><b>{peso(capital * 1.07)}</b></li>}
        <li><span>Pay the interest every month</span><b>{peso(capital + q.paidMonthly)}</b></li>
        <li><span>Pay nothing until month {months}</span><b>{peso(capital + q.unpaid)}</b></li>
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
