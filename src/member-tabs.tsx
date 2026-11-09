import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ADMIN_MEMBER_NAME } from './accounts'
import { PushSetting } from './push'
import { interestLine, peso } from './format'
import type { Txn } from './ledger'
import {
  balanceOf, comakerMode, interestNext, loanMonth, monthInterest, refLabel, requestStage, unpaidLoans, validateRequest, type LoanRequest, type LoanType,
} from './requests'
import { depositAmount, loanLimit, monthsLeft } from './rules'
import {
  changePassword, createRequest, decideAsComaker, listFounders, signOutUser, withdrawRequest, type StoredMember,
} from './store'
import { Calculator, CONDITIONS, quoteText, termOptions, TYPES } from './tabs'

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// ---------- Loans: remaining, active, requests, closed, transactions, new request, calculator ----------
export function LoansTab({ me, year, mine, txns, onPay }: { me: StoredMember; year: number; mine: LoanRequest[]; txns: Txn[]; onPay: () => void }) {
  const now = Date.now()
  const unpaid = unpaidLoans(mine, me.uid, me.sheetLoanBalance ?? 0, { txns, now })
  const [showAll, setShowAll] = useState(false) // newest 5 first; the rest on request
  const [showAllClosed, setShowAllClosed] = useState(false)
  const pending = mine.filter((r) => r.status === 'pending')
  const closed = mine.filter((r) => r.status === 'paid' || r.status === 'declined' || r.status === 'withdrawn')
    .sort((a, b) => (b.paidAt ?? b.decidedAt ?? b.createdAt) - (a.paidAt ?? a.decidedAt ?? a.createdAt)) // newest first
  return (
    <section>
      <h1 style={{ fontSize: 22 }}>My loans</h1>
      <div className={`unpaid ${unpaid.total > 0 ? 'owing' : ''}`} style={{ marginTop: 12 }}>
        <div className="unpaid-head"><span>Current loans remaining</span><b>{peso(unpaid.total)}</b></div>
        {unpaid.interestDue > 0 && <p className="note" style={{ marginTop: 4 }}>Includes {peso(unpaid.interestDue)} interest not yet paid (see each loan for its due date).</p>}
        {unpaid.total > 0 && <button className="btn wide" onClick={onPay}>Pay Now</button>}
      </div>

      <div className="section">
        <h2>Active loans</h2>
        {!unpaid.loans.length ? <p className="note">No active loans.</p> : (
          <ul className="requests">
            {unpaid.loans.map((r) => {
              const next = interestNext(r, txns, now)
              const paid = txns.filter((t) => t.loanId === r.id && !t.voidedAt && (t.kind === 'interest' || t.kind === 'principal' || t.settles))
              return (
                <RequestCard key={r.id} r={r}>
                  <ul className="rows" style={{ marginTop: 8 }}>
                    <li><span>Still owed</span><b>{peso(balanceOf(r))}</b></li>
                    {monthInterest(r) > 0 && <li><span>Interest</span><b>{interestLine(next)}</b></li>}
                    <li><span>Paid so far</span><b>{peso(sum(paid.map((t) => t.amount)))}</b></li>
                  </ul>
                  <button className="btn wide" onClick={onPay}>Pay Now</button>
                </RequestCard>
              )
            })}
          </ul>
        )}
      </div>

      {pending.length > 0 && <MyRequests mine={pending} title="Waiting for approval" />}

      <div className="section">
        <h2>Closed loans</h2>
        {!closed.length ? <p className="note">No closed loans yet.</p>
          : <ul className="requests">{(showAllClosed ? closed : closed.slice(0, 5)).map((r) => <RequestCard key={r.id} r={r}>{r.paidAt && <p className="note">Paid off {fmtDate(r.paidAt)}</p>}</RequestCard>)}</ul>}
        {closed.length > 5 && <button className="copy wide" onClick={() => setShowAllClosed(!showAllClosed)}>{showAllClosed ? 'Show fewer' : `Show all (${closed.length})`}</button>}
      </div>

      <div className="section">
        <h2>Payment transactions</h2>
        <TxnList txns={showAll ? txns : txns.slice(0, 5)} />
        {txns.length > 5 && <button className="copy wide" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all (${txns.length})`}</button>}
      </div>

      <div className="section">
        {me.terminated
          ? <><h1 style={{ fontSize: 22 }}>Request a loan</h1><p className="alert" role="status">Your account is terminated, so loans can't be requested. See the Savings tab.</p></>
          : <RequestForm me={me} year={year} hasPending={pending.length > 0} hasUnpaid={unpaid.total > 0} />}
      </div>
      <div className="section"><Calculator member={me} year={year} /></div>
    </section>
  )
}

const KIND_LABEL: Record<Txn['kind'], string> = {
  savings: 'Savings', interest: 'Interest paid', principal: 'Loan repaid', release: 'Loan released', note: 'Note',
}

/** A member's money history, newest first. Voided entries stay visible, crossed out. */
export function TxnList({ txns, onVoid, highlight, rows }: {
  txns: Txn[]; onVoid?: (t: Txn) => void; highlight?: { month: number; cycle: number }
  /** show this many entries, the rest by scrolling inside the list (rows differ in height, so it is measured) */
  rows?: number
}) {
  const list = useRef<HTMLUListElement>(null)
  useLayoutEffect(() => {
    const ul = list.current
    if (!ul || !rows) return
    const cut = ul.children[rows] as HTMLElement | undefined
    ul.style.maxHeight = cut ? `${cut.offsetTop - ul.offsetTop}px` : ''
  }, [txns, rows])
  if (!txns.length) return <p className="note">No transactions yet.</p>
  return (
    <ul className={`txns${rows ? ' scroll' : ''}`} ref={list}>
      {txns.map((t) => (
        <li key={t.id} className={[t.voidedAt && 'voided', t.month === highlight?.month && t.cycle === highlight.cycle && 'hl'].filter(Boolean).join(' ') || undefined}>
          <span className="txn-main">
            <b>{t.carryover ? 'Carryover' : KIND_LABEL[t.kind]}</b>
            <small>{fmtDate(t.createdAt)} · {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][t.month]} {t.cycle}{t.note ? ` · ${t.note}` : ''}</small>
            {t.voidedAt && <small className="void-reason">Voided: {t.voidReason}</small>}
          </span>
          <span className="txn-side">
            {t.kind !== 'note' && <b>{t.kind === 'release' ? '' : '+'}{peso(t.amount)}</b>}
            {onVoid && !t.voidedAt && (t.kind !== 'note' || t.loanId || t.carryover) && <button className="btn-mini" onClick={() => onVoid(t)}>Void</button>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function RequestForm({ me, year, hasPending, hasUnpaid }: { me: StoredMember; year: number; hasPending: boolean; hasUnpaid: boolean }) {
  const [founders, setFounders] = useState<{ id: string; name: string }[] | null>(null)
  const [type, setType] = useState<LoanType>('flex')
  const [amount, setAmount] = useState('')
  const [months, setMonths] = useState(1)
  const [picked, setPicked] = useState<[string, string]>(['', ''])
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { listFounders().then(setFounders, () => setFounders([])) }, [])

  const today = new Date()
  const saved = sum(me.paid)
  const options = termOptions(type, today, year)
  const term = options.includes(months) ? months : options[0] ?? 0
  const capital = type === 'deposit' ? depositAmount(saved) : Number(amount.replace(/[^\d.]/g, '')) || 0
  const all = founders ?? []
  const bryanId = all.find((f) => f.name === ADMIN_MEMBER_NAME)?.id
  const recruiter = all.find((f) => f.id === me.recruiterId)
  const mode = comakerMode({ borrower: me, amount: capital, type })
  const overLimitChoices = all.filter((f) => f.id !== me.uid && f.id !== bryanId)
  const comakerIds = mode === 'recruiter' ? (me.recruiterId ? [me.recruiterId] : []) : mode === 'two-founders' ? picked.filter(Boolean) : []
  const problem = validateRequest({
    borrower: me, borrowerId: me.uid, recruiterId: me.recruiterId, comakerIds, founderIds: all.map((f) => f.id), bryanId,
    type, amount: capital, months: term, today, year, hasPending, hasUnpaid, savings: saved,
  })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (problem) return setError(problem)
    setBusy(true); setError(null)
    try {
      const names = Object.fromEntries(all.map((f) => [f.id, f.name]))
      await createRequest({
        borrowerId: me.uid, borrowerName: me.name, type, amount: capital, months: term, quote: quoteText(type, capital, term),
        comakers: Object.fromEntries(comakerIds.map((id) => [id, { name: names[id], status: 'pending' as const }])),
        comakerIds, status: 'pending', createdAt: Date.now(), overLimit: mode === 'two-founders',
      })
      setSent(true); setAmount(''); setPicked(['', ''])
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
      {sent && <p className="success" role="status">{comakerIds.length ? 'Request sent. Your co-maker will see it in their Alerts.' : 'Request sent to the admin.'}</p>}
      <div className="field">
        <label htmlFor="rq-type">Loan type</label>
        <select id="rq-type" value={type} onChange={(e) => { setType(e.target.value as LoanType); setSent(false) }}>
          {Object.entries(TYPES).filter(([k]) => (k !== 'events' || me.founder) && k !== 'savings').map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <p className="note" style={{ marginTop: 0 }}>{CONDITIONS[type]}</p>
      </div>
      <div className="field">
        <label htmlFor="rq-amt">Amount (₱)</label>
        {type === 'deposit'
          ? <input id="rq-amt" value={capital.toLocaleString('en-PH')} readOnly aria-describedby="rq-amt-note" className="locked" />
          : <input id="rq-amt" inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); setSent(false) }} placeholder="e.g. 10000" />}
        {type === 'deposit' && <p id="rq-amt-note" className="note" style={{ marginTop: 0 }}>80% of your {peso(saved)} savings. This amount is fixed.</p>}
      </div>
      <div className="field">
        <label htmlFor="rq-months">Months</label>
        <select id="rq-months" value={term || ''} onChange={(e) => setMonths(Number(e.target.value))} disabled={!options.length}>
          {!options.length && <option value="">None left this year</option>}
          {options.map((n) => <option key={n} value={n}>{n} {n === 1 ? 'month' : 'months'}</option>)}
        </select>
      </div>

      {mode === 'recruiter' && (
        <div className="field">
          <label htmlFor="rq-co">Co-maker (your recruiter)</label>
          <select id="rq-co" value={me.recruiterId ?? ''} disabled={!recruiter}>
            {recruiter ? <option value={recruiter.id}>{recruiter.name}</option> : <option value="">{founders ? 'No recruiter on record. Ask the admin.' : 'Loading…'}</option>}
          </select>
        </div>
      )}
      {mode === 'none' && type !== 'deposit' && capital > 0 && <p className="note">As a founding member within your limit, no co-maker is needed.</p>}
      {mode === 'two-founders' && (
        <>
          <p className="note">This is above your {peso(loanLimit(me.heads))} limit, so 2 founding members must co-make it.</p>
          {[0, 1].map((i) => (
            <div className="field" key={i}>
              <label htmlFor={`rq-co${i}`}>Co-maker {i + 1}</label>
              <select id={`rq-co${i}`} value={picked[i]} onChange={(e) => setPicked((c) => (i === 0 ? [e.target.value, c[1]] : [c[0], e.target.value]))}>
                <option value="">Choose a founding member</option>
                {overLimitChoices.filter((f) => f.id !== picked[1 - i]).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          ))}
        </>
      )}

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
        <b>{r.ref ? <span className="ref">{refLabel(r)}</span> : null}<span className="loan-month">{loanMonth(r)}</span>{peso(r.amount)} · {TYPES[r.type]}</b>
        <span className={`stage stage-${requestStage(r).split(' ')[0].toLowerCase()}`}>{requestStage(r)}</span>
      </div>
      <p className="note" style={{ marginTop: 2 }}>{r.months} month{r.months === 1 ? '' : 's'} · {r.quote} · sent {fmtDate(r.createdAt)}</p>
      {r.comakerIds.length > 0 && (
        <ul className="comakers">
          {r.comakerIds.map((id) => (
            <li key={id} className={`co co-${r.comakers[id]?.status}`}><span aria-hidden="true">{coMark(r.comakers[id]?.status)}</span> {r.comakers[id]?.name}
              <span className="sr-only"> {r.comakers[id]?.status}</span></li>
          ))}
        </ul>
      )}
      {children}
    </li>
  )
}

function MyRequests({ mine, title }: { mine: LoanRequest[]; title: string }) {
  const [error, setError] = useState<string | null>(null)
  const withdraw = (id: string) => { setError(null); withdrawRequest(id).catch(() => setError("Couldn't withdraw. Check your connection.")) }
  return (
    <div className="section">
      <h2>{title}</h2>
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
      <PushSetting who="member" />
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
