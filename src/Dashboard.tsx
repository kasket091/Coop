import { MONTHS, peso } from './format'
import { carryoverMonths, ledgerFrom, quarterTotals, type Txn } from './ledger'
import { coopSummary } from './rules'
import type { StoredMember } from './store'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const cents = (x: number) => Math.round(x * 100) / 100
const byMonth = (rows: number[][]) => MONTHS.map((_, i) => cents(sum(rows.map((r) => r[i] ?? 0))))
const n = (x: number) => (x ? x.toLocaleString('en-PH', { maximumFractionDigits: 2 }) : '')

/** The quarterly-meeting report: the two grids the coop has always read (savings and interest by member and month). */
export function Dashboard({ members, txns, year }: { members: StoredMember[]; txns: Txn[]; year: number }) {
  const ordered = [...members].sort((a, b) => a.id - b.id) // sheet order
  const savers = ordered.filter((m) => m.heads > 0)
  const savingsMonths = byMonth(savers.map((m) => m.paid))
  const interestMonths = byMonth(ordered.map((m) => m.interest))
  const c = coopSummary(members)
  const top = c.top?.name
  const qs = quarterTotals(savingsMonths), qi = quarterTotals(interestMonths)
  const carry = carryoverMonths(txns, year)
  const cls = (uid: string, month: number) => (carry.get(uid)?.has(month) ? 'carry' : undefined)
  // savings carried over into a Savings Loan: shown red in the cell, left out of every total
  const carried = new Map(members.map((m) => [m.uid, ledgerFrom(txns.filter((t) => t.memberId === m.uid), year).carried]))
  const savingsCell = (m: StoredMember, i: number) => {
    const c = carried.get(m.uid)?.[i] ?? 0
    return c ? <>{n(m.paid[i])}{m.paid[i] ? ' + ' : ''}<span title="Carried over to a Savings Loan, not counted">{n(c)}</span></> : n(m.paid[i])
  }

  return (
    <section className="dashboard">
      <div className="who">
        <h1 style={{ fontSize: 22 }}>Quarterly report {year}</h1>
        <button className="copy no-print" onClick={() => window.print()}>Print</button>
      </div>
      <p className="plan">As of {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <div className="kpis">
        <div><span>Members</span><b>{savers.length}</b></div>
        <div><span>Heads</span><b>{c.totalHeads}</b></div>
        <div><span>Total savings</span><b>{peso(c.totalSavings)}</b></div>
        <div><span>Total interest</span><b>{peso(c.totalInterest)}</b></div>
        <div><span>Dividend per head</span><b>{peso(c.dividendPerHead)}</b></div>
        <div><span>Top borrower (3%)</span><b>{top ? `${top} · ${peso(c.top!.rebate)}` : 'None yet'}</b></div>
      </div>

      <h2 className="dash-h">By quarter</h2>
      <div className="grid-wrap">
        <table className="sheet quarters">
          <thead><tr><th></th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Total</th></tr></thead>
          <tbody>
            <tr><th scope="row">Savings</th>{qs.map((q, i) => <td key={i}>{n(q)}</td>)}<td className="tot">{n(sum(qs))}</td></tr>
            <tr><th scope="row">Interest</th>{qi.map((q, i) => <td key={i}>{n(q)}</td>)}<td className="tot">{n(cents(sum(qi)))}</td></tr>
          </tbody>
        </table>
      </div>

      <h2 className="dash-h">Members monthly savings</h2>
      <div className="grid-wrap">
        <table className="sheet">
          <thead>
            <tr><th className="sticky">Share holder</th><th># Heads</th><th>Monthly</th><th>Share %</th>{MONTHS.map((mo) => <th key={mo}>{mo}</th>)}<th className="tot">Total savings</th></tr>
          </thead>
          <tbody>
            {savers.map((m) => (
              <tr key={m.uid}>
                <th scope="row" className="sticky">{m.name}</th>
                <td>{m.heads}</td><td>{n(m.heads * 500)}</td><td>{c.totalHeads ? ((m.heads / c.totalHeads) * 100).toFixed(2) : ''}</td>
                {MONTHS.map((_, i) => <td key={i} className={cls(m.uid, i)}>{savingsCell(m, i)}</td>)}
                <td className="tot">{n(sum(m.paid))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row" className="sticky">Total contribution per month</th><td>{c.totalHeads}</td><td>{n(c.totalHeads * 500)}</td><td>100.00</td>
              {savingsMonths.map((v, i) => <td key={i}>{n(v)}</td>)}<td className="tot">{n(sum(savingsMonths))}</td></tr>
          </tfoot>
        </table>
      </div>

      <h2 className="dash-h">Member interest collections</h2>
      <div className="grid-wrap">
        <table className="sheet">
          <thead>
            <tr><th className="sticky">Member</th>{MONTHS.map((mo) => <th key={mo}>{mo}</th>)}<th className="tot">Total</th><th>3% bonus (top borrower only)</th></tr>
          </thead>
          <tbody>
            {ordered.map((m) => {
              const t = cents(sum(m.interest))
              return (
                <tr key={m.uid} className={m.name === top ? 'top' : undefined}>
                  <th scope="row" className="sticky">{m.name}{m.name === top ? ' ★' : ''}</th>
                  {MONTHS.map((_, i) => <td key={i} className={cls(m.uid, i)}>{n(m.interest[i])}</td>)}
                  <td className="tot">{n(t)}</td><td>{n(Math.round(t * 0.03))}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr><th scope="row" className="sticky">Monthly total</th>{interestMonths.map((v, i) => <td key={i}>{n(v)}</td>)}
              <td className="tot">{n(cents(sum(interestMonths)))}</td><td></td></tr>
          </tfoot>
        </table>
      </div>
      <p className="note dash-legend"><i className="swatch carry" aria-hidden="true" /> Red = carryover month: carried-over savings show in the cell but are not counted in any total; on the interest grid, interest was added to the balance · ★ top borrower: the only one who receives the 3% bonus · voided entries are not counted.</p>
    </section>
  )
}
