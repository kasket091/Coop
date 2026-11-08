import { useEffect, useState, type FormEvent } from 'react'
import { peso } from './format'
import { requestStage, validateRequest, type LoanRequest, type LoanType } from './requests'
import { loanLimit, monthsLeft } from './rules'
import {
  changePassword, createRequest, decideAsComaker, listFounders, signOutUser, withdrawRequest, type StoredMember,
} from './store'
import { Calculator, CONDITIONS, quoteText, termOptions, TYPES } from './tabs'

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

// ---------- Loans: calculator + request + my requests ----------
export function LoansTab({ me, year, mine }: { me: StoredMember; year: number; mine: LoanRequest[] }) {
  return (
    <section>
      <MyRequests mine={mine} />
      <div className={mine.length ? 'section' : undefined}>
        <RequestForm me={me} year={year} hasPending={mine.some((r) => r.status === 'pending')} />
      </div>
      <div className="section"><Calculator member={me} year={year} /></div>
    </section>
  )
}

function RequestForm({ me, year, hasPending }: { me: StoredMember; year: number; hasPending: boolean }) {
  const [founders, setFounders] = useState<{ id: string; name: string }[] | null>(null)
  const [type, setType] = useState<LoanType>('flex')
  const [amount, setAmount] = useState('')
  const [months, setMonths] = useState(1)
  const [co, setCo] = useState<[string, string]>(['', ''])
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { listFounders().then(setFounders, () => setFounders([])) }, [])

  const today = new Date()
  const options = termOptions(type, today, year)
  const term = options.includes(months) ? months : options[0] ?? 0
  const capital = Number(amount.replace(/[^\d.]/g, '')) || 0
  const choices = (founders ?? []).filter((f) => f.id !== me.uid)
  const problem = validateRequest({
    borrower: me, borrowerId: me.uid, comakerIds: co, founderIds: choices.map((f) => f.id),
    type, amount: capital, months: term, today, year, hasPending,
  })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (problem) return setError(problem)
    setBusy(true); setError(null)
    try {
      const names = Object.fromEntries(choices.map((f) => [f.id, f.name]))
      await createRequest({
        borrowerId: me.uid, borrowerName: me.name, type, amount: capital, months: term, quote: quoteText(type, capital, term),
        comakers: { [co[0]]: { name: names[co[0]], status: 'pending' }, [co[1]]: { name: names[co[1]], status: 'pending' } },
        comakerIds: [...co], status: 'pending', createdAt: Date.now(),
      })
      setSent(true); setAmount(''); setCo(['', ''])
    } catch {
      setError("Couldn't send the request. Check your connection and try again.")
    } finally { setBusy(false) }
  }

  if (monthsLeft(today, year) < 1) {
    return (<><h1 style={{ fontSize: 22 }}>Request a loan</h1><p className="alert" role="status">Loans are closed for {year}: nothing can be repaid by December 15 any more.</p></>)
  }
  return (
    <form onSubmit={submit}>
      <h1 style={{ fontSize: 22 }}>Request a loan</h1>
      <p className="plan">Limit {peso(loanLimit(me.heads))} · repay by December 15</p>
      {sent && <p className="success" role="status">Request sent. Your co-makers will see it in their Alerts.</p>}
      <div className="field">
        <label htmlFor="rq-type">Loan type</label>
        <select id="rq-type" value={type} onChange={(e) => setType(e.target.value as LoanType)}>
          {Object.entries(TYPES).filter(([k]) => k !== 'events' || me.founder).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <p className="note" style={{ marginTop: 0 }}>{CONDITIONS[type]}</p>
      </div>
      <div className="field">
        <label htmlFor="rq-amt">Amount (₱)</label>
        <input id="rq-amt" inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); setSent(false) }} placeholder="e.g. 10000" />
      </div>
      <div className="field">
        <label htmlFor="rq-months">Months</label>
        <select id="rq-months" value={term || ''} onChange={(e) => setMonths(Number(e.target.value))} disabled={!options.length}>
          {!options.length && <option value="">None left this year</option>}
          {options.map((n) => <option key={n} value={n}>{n} {n === 1 ? 'month' : 'months'}</option>)}
        </select>
      </div>
      {[0, 1].map((i) => (
        <div className="field" key={i}>
          <label htmlFor={`rq-co${i}`}>Co-maker {i + 1}</label>
          <select id={`rq-co${i}`} value={co[i]} onChange={(e) => setCo((c) => (i === 0 ? [e.target.value, c[1]] : [c[0], e.target.value]))}>
            <option value="">{founders ? 'Choose a founding member' : 'Loading…'}</option>
            {choices.filter((f) => f.id !== co[1 - i]).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      ))}
      {capital > 0 && term > 0 && !problem && <p className="note">{quoteText(type, capital, term)}</p>}
      {(error || (capital > 0 && problem)) && <p className="alert" role="alert">{error ?? problem}</p>}
      <button className="btn wide" disabled={busy || !!problem}>{busy ? 'Sending…' : 'Send request'}</button>
    </form>
  )
}

const coMark = (s: string) => (s === 'approved' ? '✓' : s === 'declined' ? '✗' : '…')

export function RequestCard({ r, children }: { r: LoanRequest; children?: React.ReactNode }) {
  return (
    <li className="request">
      <div className="request-head">
        <b>{peso(r.amount)} · {TYPES[r.type]}</b>
        <span className={`stage stage-${requestStage(r).split(' ')[0].toLowerCase()}`}>{requestStage(r)}</span>
      </div>
      <p className="note" style={{ marginTop: 2 }}>{r.months} month{r.months === 1 ? '' : 's'} · {r.quote} · sent {fmtDate(r.createdAt)}</p>
      <ul className="comakers">
        {r.comakerIds.map((id) => (
          <li key={id} className={`co co-${r.comakers[id]?.status}`}><span aria-hidden="true">{coMark(r.comakers[id]?.status)}</span> {r.comakers[id]?.name}
            <span className="sr-only"> {r.comakers[id]?.status}</span></li>
        ))}
      </ul>
      {children}
    </li>
  )
}

function MyRequests({ mine }: { mine: LoanRequest[] }) {
  const [error, setError] = useState<string | null>(null)
  if (!mine.length) return null
  const withdraw = (id: string) => { setError(null); withdrawRequest(id).catch(() => setError("Couldn't withdraw. Check your connection.")) }
  return (
    <div>
      <h1 style={{ fontSize: 22 }}>My requests</h1>
      {error && <p className="alert" role="alert">{error}</p>}
      <ul className="requests">
        {mine.map((r) => (
          <RequestCard key={r.id} r={r}>
            {r.status === 'pending' && <button className="link" onClick={() => withdraw(r.id)}>Withdraw request</button>}
          </RequestCard>
        ))}
      </ul>
    </div>
  )
}

// ---------- Alerts: founders approve as co-maker ----------
export function AlertsTab({ me, asked }: { me: StoredMember; asked: LoanRequest[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const waiting = asked.filter((r) => r.status === 'pending' && r.comakers[me.uid]?.status === 'pending')
  const done = asked.filter((r) => !waiting.includes(r))
  const decide = async (r: LoanRequest, s: 'approved' | 'declined') => {
    setBusy(r.id); setError(null)
    try { await decideAsComaker(r, me.uid, s) } catch { setError("Couldn't save your answer. It may have been withdrawn, or check your connection.") } finally { setBusy(null) }
  }
  return (
    <section>
      <h1 style={{ fontSize: 22 }}>Co-maker requests</h1>
      <p className="plan">Members who asked you to vouch for their loan.</p>
      {error && <p className="alert" role="alert">{error}</p>}
      {!waiting.length && <p className="note section">Nothing waiting for you.</p>}
      <ul className="requests">
        {waiting.map((r) => (
          <RequestCard key={r.id} r={r}>
            <p className="asker"><b>{r.borrowerName}</b> asked you to co-make this loan.</p>
            <div className="actions">
              <button className="btn" disabled={busy === r.id} onClick={() => decide(r, 'approved')}>Approve</button>
              <button className="copy" disabled={busy === r.id} onClick={() => decide(r, 'declined')}>Decline</button>
            </div>
          </RequestCard>
        ))}
      </ul>
      {done.length > 0 && (
        <div className="section">
          <h2>Earlier</h2>
          <ul className="requests">{done.map((r) => <RequestCard key={r.id} r={r}><p className="note">Borrower: {r.borrowerName}</p></RequestCard>)}</ul>
        </div>
      )}
    </section>
  )
}

// ---------- Account ----------
export function AccountTab({ me }: { me: StoredMember }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (next.length < 6) return setMsg({ ok: false, text: 'Use at least 6 characters.' })
    if (next !== again) return setMsg({ ok: false, text: "The new passwords don't match." })
    setBusy(true); setMsg(null)
    try {
      await changePassword(current, next)
      setMsg({ ok: true, text: 'Password changed. Use it next time you log in.' })
      setCurrent(''); setNext(''); setAgain('')
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }) } finally { setBusy(false) }
  }

  return (
    <section>
      <h1 style={{ fontSize: 22 }}>My account</h1>
      <div className="section">
        <ul className="rows panel">
          <li><span>Name</span><b>{me.name}</b></li>
          <li><span>Heads (locked)</span><b>{me.heads}</b></li>
          <li><span>Monthly savings</span><b>{peso(me.heads * 500)}</b></li>
          <li><span>Founding member</span><b>{me.founder ? 'Yes' : 'No'}</b></li>
          <li><span>Member since</span><b>{new Date(me.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</b></li>
        </ul>
      </div>
      <form className="section" onSubmit={submit}>
        <h2>Change password</h2>
        <div className="field"><label htmlFor="pw-cur">Current password</label>
          <input id="pw-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required /></div>
        <div className="field"><label htmlFor="pw-new">New password</label>
          <input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required /></div>
        <div className="field"><label htmlFor="pw-again">New password again</label>
          <input id="pw-again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required /></div>
        {msg && <p className={msg.ok ? 'success' : 'alert'} role="status">{msg.text}</p>}
        <button className="btn wide" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </form>
      <div className="section"><button className="copy wide" onClick={() => signOutUser()}>Log out</button></div>
    </section>
  )
}
