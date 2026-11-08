import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadMembers } from './data'
import { MONTHS, peso } from './format'
import { IconAlert, IconCheck, IconCoop, IconLoans, IconPay, IconSavings } from './icons'
import { closedMonths, coopSummary, loanLimit, memberSummary, minAnnualLoan, missedOwed, type CoopSummary, type Member } from './rules'
import { Coop, Loans, PayRules } from './tabs'

const KEY = 'hilas.member'
const store = {
  get: () => { try { return localStorage.getItem(KEY) } catch { return null } },
  set: (v: string | null) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY) } catch { /* private mode */ } },
}

type Tab = 'savings' | 'coop' | 'loans' | 'pay'
const TABS: { id: Tab; label: string; Icon: () => JSX.Element }[] = [
  { id: 'savings', label: 'My Savings', Icon: IconSavings },
  { id: 'coop', label: 'Coop', Icon: IconCoop },
  { id: 'loans', label: 'Loans', Icon: IconLoans },
  { id: 'pay', label: 'Pay & Rules', Icon: IconPay },
]

export default function App() {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('savings')
  const [name, setName] = useState<string | null>(store.get)

  const load = useCallback(() => {
    setError(null)
    loadMembers().then(setMembers, (e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const coop = useMemo(() => (members ? coopSummary(members) : null), [members])
  const me = members?.find((m) => m.name === name && m.heads > 0) ?? null
  const choose = (n: string | null) => { store.set(n); setName(n); setTab('savings') }

  return (
    <>
      <header className="band">
        <img src="logo.png" alt="" width="36" height="36" />
        <strong>HILAS COOP</strong>
        <span className="year" aria-label="2026">2026</span>
      </header>
      <main>
        {error ? (
          <div className="error" role="alert">
            <h1>Couldn't load the coop sheet</h1>
            <p>Check your connection, then try again.</p>
            <button className="btn" onClick={load}>Try again</button>
          </div>
        ) : !members || !coop ? (
          <div aria-busy="true" aria-label="Loading">
            {[60, 90, 40, 75].map((w, i) => <div key={i} className="skeleton" style={{ width: `${w}%` }} />)}
          </div>
        ) : tab === 'coop' ? <Coop coop={coop} members={members} />
          : tab === 'loans' ? <Loans member={me} />
          : tab === 'pay' ? <PayRules />
          : me ? <MySavings m={me} coop={coop} onChange={() => choose(null)} />
          : <Picker members={members} onPick={choose} />}
      </main>
      <nav className="tabs" aria-label="Sections">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
            <Icon />{label}
          </button>
        ))}
      </nav>
    </>
  )
}

function Picker({ members, onPick }: { members: Member[]; onPick: (name: string) => void }) {
  const [q, setQ] = useState('')
  const list = members
    .filter((m) => m.heads > 0 && m.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <section className="picker">
      <h1>Who's checking?</h1>
      <p className="note">Pick your name once. This phone will remember it.</p>
      <div className="field">
        <label htmlFor="q">Search your name</label>
        <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </div>
      <ul className="panel">
        {list.map((m) => (
          <li key={m.name}><button onClick={() => onPick(m.name)}>{m.name}<span>{m.heads} heads</span></button></li>
        ))}
        {list.length === 0 && <li className="note" style={{ padding: 16 }}>No member named “{q}”. Check the spelling.</li>}
      </ul>
    </section>
  )
}

function MySavings({ m, coop, onChange }: { m: Member; coop: CoopSummary; onChange: () => void }) {
  const today = new Date()
  const s = memberSummary(m, coop, today)
  const closed = closedMonths(today)
  const owed = s.missed.reduce((t, i) => t + missedOwed(s.monthlyDue - m.paid[i], closed - i), 0)
  const state = (i: number) => (m.paid[i] >= s.monthlyDue ? 'paid' : s.missed.includes(i) ? 'missed' : i === closed ? 'due' : 'open')

  return (
    <section>
      <div className="who">
        <h1>{m.name}</h1>
        <button className="link" onClick={onChange}>Not you?</button>
      </div>
      <p className="plan">{m.heads} heads · {peso(s.monthlyDue)} a month · locked until December</p>

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
        <span><i style={{ border: '2px dashed var(--teal)' }} />Next due (1st–7th)</span>
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
