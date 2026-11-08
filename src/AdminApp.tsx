import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { RECRUITS, startingPassword } from './accounts'
import { backupSummary, parseBackup, type Backup } from './backup'
import { Dashboard } from './Dashboard'
import { MONTHS, peso } from './format'
import { IconChart, IconCoop, IconLoans, IconPay, IconSavings } from './icons'
import { RequestCard, TxnList } from './member-tabs'
import { balanceOf, canAdminApprove, customPayment, monthInterest, refLabel, unpaidLoans, type LoanRequest } from './requests'
import { carryoverMonths } from './ledger'
import { closedMonths } from './rules'
import { terminationFlag } from './termination'
import { coopSummary } from './rules'
import { CoopSection, MySavings } from './savings'
import { Loading, Shell, type TabDef } from './Shell'
import {
  addMember, addTransaction, adminDecide, clearDatabase, ensureRefs, exportDatabase, restoreDatabase, carryOverSavings, fixSavingsLoans, markCarryover, restoreMember, terminateMember, carryOverLoan, deleteMember, ledgerMonth, loanCustomPayment, markLoanPaid,
  payLoanInterest, recomputeSummary, renameMember, resetLogin, saveHeads, saveSheetLoanBalance,
  signOutUser, startCycle, voidTransaction, watchAllMembers, watchAllRequests, watchAllTransactions, watchSummary,
  type StoredMember, type Summary, type Txn, closeLoanNoMoney, rebuildAllLedgers, setRecruiter,
} from './store'

type Tab = 'members' | 'loans' | 'requests' | 'dashboard' | 'coop'
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function AdminApp({ year }: { year: number }) {
  const [members, setMembers] = useState<StoredMember[] | null>(null)
  const [requests, setRequests] = useState<LoanRequest[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [txns, setTxns] = useState<Txn[]>([])
  const [tab, setTab] = useState<Tab>('members')
  useEffect(() => watchAllMembers(setMembers), [])
  useEffect(() => watchAllRequests(setRequests), [])
  useEffect(() => watchSummary(setSummary), [])
  useEffect(() => watchAllTransactions(setTxns), [])

  const ready = requests.filter(canAdminApprove).length
  const tabs: TabDef<Tab>[] = [
    { id: 'members', label: 'Members', Icon: IconSavings },
    { id: 'loans', label: 'Loans', Icon: IconPay },
    { id: 'requests', label: 'Requests', Icon: IconLoans, badge: ready },
    { id: 'dashboard', label: 'Dashboard', Icon: IconChart },
    { id: 'coop', label: 'Coop', Icon: IconCoop },
  ]
  return (
    <Shell year={year} tabs={tabs} current={tab} onTab={setTab}>
      <p className="admin-flag">Admin</p>
      {!members ? <Loading />
        : tab === 'members' ? <Members members={members} requests={requests} txns={txns} year={year} />
        : tab === 'loans' ? <LoansAdmin requests={requests} members={members} year={year} />
        : tab === 'requests' ? <Requests requests={requests} year={year} />
        : tab === 'dashboard' ? <Dashboard members={members} txns={txns} year={year} />
        : <CoopAdmin members={members} summary={summary} year={year} />}
    </Shell>
  )
}

// ---------- members ----------
function Members({ members, requests, txns, year }: { members: StoredMember[]; requests: LoanRequest[]; txns: Txn[]; year: number }) {
  const [q, setQ] = useState('')
  const [boardOnly, setBoardOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const selected = members.find((m) => m.uid === open)
  const back = (msg?: string) => { setOpen(null); setNotice(msg ?? null); window.scrollTo(0, 0) }
  const show = (uid: string) => { setOpen(uid); window.scrollTo(0, 0) }
  if (selected) return <MemberDetail m={selected} members={members} requests={requests} txns={txns.filter((t) => t.memberId === selected.uid)} year={year} onBack={back} onOpen={show} />
  if (adding) return <AddMember year={year} board={members.filter((x) => x.founder && x.heads > 0)} onDone={() => setAdding(false)} />
  const list = members.filter((m) => (!boardOnly || m.founder) && m.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <section className="picker">
      <div className="who"><h1>Members</h1><button className="btn" onClick={() => setAdding(true)}>Add member</button></div>
      <p className="plan">{members.filter((m) => m.heads > 0).length} members · {sum(members.map((m) => m.heads))} heads</p>
      {notice && <p className="success" role="status">{notice}</p>}
      <div className="field"><label htmlFor="mq">Search</label>
        <input id="mq" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></div>
      <label className="check"><input type="checkbox" checked={boardOnly} onChange={(e) => setBoardOnly(e.target.checked)} /> Board members only</label>
      <ul className="panel">
        {list.map((m) => (
          <li key={m.uid}><button onClick={() => show(m.uid)}>
            {m.name}{m.founder ? ' ★' : ''}
            <span>{m.terminated ? 'terminated' : m.heads ? `${m.heads} heads · ${peso(sum(m.paid))}` : 'left · interest only'}</span>
          </button></li>
        ))}
        {!list.length && <li className="note" style={{ padding: 16 }}>{members.length ? `No member named “${q}”.` : 'No members yet. Tap Add member to start this cycle.'}</li>}
      </ul>
      <p className="note">★ board member</p>
    </section>
  )
}

function AddMember({ year, board, onDone }: { year: number; board: StoredMember[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [heads, setHeads] = useState('2')
  const [founder, setFounder] = useState(false)
  const [recruiterId, setRecruiterId] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const h = Number(heads)
    if (!Number.isInteger(h) || h < 2 || h > 14) return setError('Heads must be a whole number from 2 to 14.')
    if (!founder && !recruiterId) return setError('Choose who recruited them (their co-maker), or tick Board member.')
    setBusy(true); setError(null)
    try { await addMember({ name, heads: h, founder, year, recruiterId: founder ? undefined : recruiterId }); setDone(name.trim()) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  if (done) {
    return (
      <section>
        <h1 style={{ fontSize: 22 }}>{done} is a member</h1>
        <p className="success">Their first password is <b>{startingPassword(done)}</b>. They can change it in Account.</p>
        <button className="btn wide" onClick={onDone}>Back to members</button>
      </section>
    )
  }
  return (
    <form onSubmit={submit}>
      <div className="who"><h1 style={{ fontSize: 22 }}>Add member</h1><button type="button" className="link" onClick={onDone}>Cancel</button></div>
      <div className="field"><label htmlFor="an">Full name</label><input id="an" value={name} onChange={(e) => setName(e.target.value)} required autoCapitalize="words" /></div>
      <div className="field"><label htmlFor="ah">Heads (locked until December)</label><input id="ah" inputMode="numeric" value={heads} onChange={(e) => setHeads(e.target.value)} required /></div>
      <label className="check"><input type="checkbox" checked={founder} onChange={(e) => setFounder(e.target.checked)} /> Board member (can be a co-maker; needs no recruiter)</label>
      {!founder && (
        <div className="field"><label htmlFor="ar">Recruited by (their co-maker)</label>
          <select id="ar" value={recruiterId} onChange={(e) => setRecruiterId(e.target.value)} required>
            <option value="">Choose a board member</option>
            {board.map((b) => <option key={b.uid} value={b.uid}>{b.name}</option>)}
          </select></div>
      )}
      {error && <p className="alert" role="alert">{error}</p>}
      <button className="btn wide" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
    </form>
  )
}

function MemberDetail({ m, members, requests, txns, year, onBack, onOpen }: {
  m: StoredMember; members: StoredMember[]; requests: LoanRequest[]; txns: Txn[]; year: number
  onBack: (notice?: string) => void; onOpen: (uid: string) => void
}) {
  const [heads, setHeads] = useState(String(m.heads))
  useEffect(() => setHeads(String(m.heads)), [m.heads])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'reset' | 'rename' | null>(null)
  const [typed, setTyped] = useState('')
  const coop = useMemo(() => coopSummary(members), [members])
  const recruits = m.founder ? members.filter((x) => x.recruiterId === m.uid) : []
  const flag = m.heads > 0 ? terminationFlag(carryoverMonths(txns, year).get(m.uid) ?? new Set(), m.paid, m.heads * 500, closedMonths(new Date(), year)) : null
  const flagReason = flag ? `3 carryover months in a row (${flag.months.map((i) => MONTHS[i]).join(', ')}) and ${MONTHS[flag.fourth]} not paid.` : ''
  const unpaidTotal = unpaidLoans(requests, m.uid, m.sheetLoanBalance ?? 0).total
  const terminate = async () => {
    const reason = window.prompt(`Terminate ${m.name}? Their savings (less the 20% fee) will pay their unpaid loans, which then close. Loans and the projected dividend are disabled. Reason:`, flagReason || '')
    if (!reason) return
    try { await terminateMember(m, reason, year, requests); setMsg({ ok: true, text: `${m.name} is terminated. Their loans were paid from savings.` }) } catch (err) { setMsg({ ok: false, text: (err as Error).message }) }
  }
  const restore = async () => {
    if (!window.confirm(`Restore ${m.name}'s account? Loans and the dividend come back.`)) return
    try { await restoreMember(m, year); setMsg({ ok: true, text: `${m.name} is active again.` }) } catch (err) { setMsg({ ok: false, text: (err as Error).message }) }
  }
  const recruiter = members.find((x) => x.uid === m.recruiterId)
  const expected = m.founder ? RECRUITS[m.name] ?? [] : []

  const act = async () => {
    setBusy(true); setMsg(null)
    try {
      if (confirm === 'delete') { await deleteMember(m); onBack(`${m.name} was deleted.`); return }
      if (confirm === 'reset') { await resetLogin(m); onBack(`${m.name}'s login was reset. Their password is now ${startingPassword(m.name)}.`); return }
      if (confirm === 'rename') { await renameMember(m, typed); setMsg({ ok: true, text: 'Renamed. They log in with the new name.' }) }
      setConfirm(null); setTyped('')
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }) } finally { setBusy(false) }
  }
  const saveH = async () => {
    const h = Number(heads)
    if (!Number.isInteger(h) || h < 0 || h > 14) return setMsg({ ok: false, text: 'Heads must be a whole number from 0 to 14.' })
    setBusy(true); setMsg(null)
    try { await saveHeads(m.uid, h); await recomputeSummary(members.map((x) => (x.uid === m.uid ? { ...x, heads: h } : x))); setMsg({ ok: true, text: 'Heads saved.' }) }
    catch { setMsg({ ok: false, text: "Couldn't save. Check your connection." }) } finally { setBusy(false) }
  }
  const askVoid = async (t: Txn) => {
    const reason = window.prompt(`Void this ${t.kind} entry${t.amount ? ` of ${peso(t.amount)}` : ''}? Type the reason:`)
    if (!reason) return
    setMsg(null)
    try { await voidTransaction(t, reason, year); setMsg({ ok: true, text: 'Voided. Totals updated.' }) } catch (err) { setMsg({ ok: false, text: (err as Error).message }) }
  }

  return (
    <section>
      <MySavings m={m} coop={coop} year={year} action={<button className="link" onClick={() => onBack()}>Back</button>}
        termination={m.terminated ? { ...m.terminated, unpaid: unpaidTotal } : undefined}
        extra={<>
          {m.terminated
            ? <p className="alert" role="status">Terminated {new Date(m.terminated.at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}. <button className="link inline" onClick={restore}>Restore account</button></p>
            : flag && <div className="alert" role="status"><b>Should be terminated:</b> {flagReason} <span className="pay-buttons" style={{ marginTop: 8 }}><button className="btn danger" onClick={terminate}>Terminate</button></span></div>}
          {!m.founder && m.heads > 0 && <RecruiterLine m={m} recruiter={recruiter} board={members.filter((x) => x.founder && x.heads > 0 && x.uid !== m.uid)} year={year} onOpen={onOpen} />}
          <UnpaidLoans m={m} requests={requests} year={year} />
        </>} />

      {m.founder && (
        <div className="section">
          <h2>Recruited by {m.name.split(' ')[0]} ({recruits.length})</h2>
          {!recruits.length ? <p className="note">{expected.length ? 'Not linked yet. Run the re-sync in the Coop tab.' : 'No recruits this year.'}</p> : (
            <ul className="panel recruits">
              {recruits.map((r) => (
                <li key={r.uid}><button onClick={() => onOpen(r.uid)}>{r.name}<span>{r.heads} heads · {peso(r.paid.reduce((a, b) => a + b, 0))}</span></button></li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="section">
        <h2>Transactions</h2>
        <AddTxn m={m} year={year} onDone={(text) => setMsg({ ok: true, text })} />
        <CarrySavings m={m} year={year} onDone={(text) => setMsg({ ok: true, text })} />
        <MarkCarryover m={m} year={year} onDone={(text) => setMsg({ ok: true, text })} />
        {msg && <p className={msg.ok ? 'success' : 'alert'} role="status">{msg.text}</p>}
        <TxnList txns={txns} onVoid={askVoid} />
      </div>

      <div className="section">
        <h2>Heads</h2>
        <div className="field"><label htmlFor="eh">Heads (locked until December)</label><input id="eh" inputMode="numeric" value={heads} onChange={(e) => setHeads(e.target.value)} /></div>
        <button className="copy wide" disabled={busy || heads === String(m.heads)} onClick={saveH}>Save heads</button>
      </div>

      {m.hasLogin && (
        <div className="section">
          <h2>Login</h2>
          {!confirm && (
            <div className="actions">
              <button className="copy" onClick={() => setConfirm('reset')}>Reset password</button>
              <button className="copy" onClick={() => { setConfirm('rename'); setTyped(m.name) }}>Fix name</button>
              <button className="copy danger" onClick={() => setConfirm('delete')}>Delete</button>
            </div>
          )}
          {confirm === 'reset' && <Confirm text={`Reset ${m.name}'s password back to ${startingPassword(m.name)}?`} busy={busy} onYes={act} onNo={() => setConfirm(null)} />}
          {confirm === 'rename' && (
            <div className="field"><label htmlFor="rn">Correct full name</label><input id="rn" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <div className="actions"><button className="btn" disabled={busy || !typed.trim()} onClick={act}>Save name</button><button className="copy" onClick={() => setConfirm(null)}>Cancel</button></div></div>
          )}
          {confirm === 'delete' && (
            <div className="field"><label htmlFor="del">Type <b>{m.name}</b> to delete permanently</label><input id="del" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              <div className="actions"><button className="btn danger" disabled={busy || typed.trim() !== m.name} onClick={act}>Delete member</button><button className="copy" onClick={() => { setConfirm(null); setTyped('') }}>Cancel</button></div></div>
          )}
        </div>
      )}
    </section>
  )
}

/** Carry over a missed month's savings: the month counts as saved (red), and a 10% Savings Loan (nSL) starts at once. */
function CarrySavings({ m, year, onDone }: { m: StoredMember; year: number; onDone: (msg: string) => void }) {
  const due = m.heads * 500
  const firstShort = m.paid.findIndex((p, i) => i <= ledgerMonth(year) && p < due)
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(firstShort >= 0 ? firstShort : ledgerMonth(year))
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const missing = Math.max(0, due - (m.paid[month] ?? 0))
  const n = amount === '' ? missing : Number(amount.replace(/[^\d.]/g, '')) || 0
  if (!open) return <button className="btn-mini carry-open" onClick={() => setOpen(true)}>Carry over missed savings</button>
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!window.confirm(`Carry over ${m.name}'s ${MONTHS[month]} savings of ${peso(n)}? A Savings Loan of ${peso(Math.round(n * 110) / 100)} (with 10% added) starts now.`)) return
    setBusy(true); setError(null)
    try {
      const ref = await carryOverSavings(m, month, n, year)
      onDone(`${MONTHS[month]} savings carried over as loan ${ref}: ${peso(Math.round(n * 110) / 100)} owed.`); setOpen(false); setAmount('')
    } catch (err) { setError((err as Error).message || "Couldn't save. Check your connection.") } finally { setBusy(false) }
  }
  return (
    <form className="add-txn carry-form" onSubmit={submit}>
      <b className="carry-title">Carry over missed savings</b>
      <div className="add-txn-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="field"><label htmlFor="sm">Month missed</label>
          <select id="sm" value={month} onChange={(e) => { setMonth(Number(e.target.value)); setAmount('') }}>{MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}</select></div>
        <div className="field"><label htmlFor="sa">Amount (₱)</label>
          <input id="sa" inputMode="decimal" value={amount === '' ? String(missing) : amount} onChange={(e) => setAmount(e.target.value)} /></div>
      </div>
      <p className="note" style={{ marginTop: 0 }}>A Savings Loan of {peso(n)} + 10% at once = <b>{peso(Math.round(n * 110) / 100)} owed</b>, then 10% a month. {MONTHS[month]} shows red on the Dashboard but does not count as saved.</p>
      {error && <p className="alert" role="alert">{error}</p>}
      <span className="pay-buttons">
        <button className="btn" disabled={busy || !(n > 0)}>{busy ? 'Saving…' : 'Carry over as loan'}</button>
        <button type="button" className="copy" onClick={() => setOpen(false)}>Cancel</button>
      </span>
    </form>
  )
}

/** Mark a range of months as carryover (interest added to the balance). Shows red on the dashboard. */
function MarkCarryover({ m, year, onDone }: { m: StoredMember; year: number; onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(ledgerMonth(year))
  const [to, setTo] = useState(ledgerMonth(year))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) return <button className="btn-mini carry-open" onClick={() => setOpen(true)}>Mark carryover months</button>
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await markCarryover(m, from, to, '', year)
      onDone(`Marked ${MONTHS[Math.min(from, to)]}–${MONTHS[Math.max(from, to)]} as carryover for ${m.name}.`); setOpen(false)
    } catch (err) { setError((err as Error).message || "Couldn't save. Check your connection.") } finally { setBusy(false) }
  }
  return (
    <form className="add-txn" onSubmit={submit}>
      <b className="carry-title">Mark carryover months</b>
      <div className="add-txn-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="field"><label htmlFor="cf">From</label>
          <select id="cf" value={from} onChange={(e) => setFrom(Number(e.target.value))}>{MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}</select></div>
        <div className="field"><label htmlFor="ct">To</label>
          <select id="ct" value={to} onChange={(e) => setTo(Number(e.target.value))}>{MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}</select></div>
      </div>
      <p className="note" style={{ marginTop: 0 }}>Records the months only (no money). They show red on the Dashboard; void one to undo it.</p>
      {error && <p className="alert" role="alert">{error}</p>}
      <span className="pay-buttons">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Mark as carryover'}</button>
        <button type="button" className="copy" onClick={() => setOpen(false)}>Cancel</button>
      </span>
    </form>
  )
}

/** Who recruited this member (their one co-maker): shown, and changeable by the admin. */
function RecruiterLine({ m, recruiter, board, year, onOpen }: {
  m: StoredMember; recruiter?: StoredMember; board: StoredMember[]; year: number; onOpen: (uid: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [pick, setPick] = useState(recruiter?.uid ?? '')
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setError(null)
    try { await setRecruiter(m, board.find((b) => b.uid === pick) ?? null, year); setEditing(false) } catch (err) { setError((err as Error).message) }
  }
  if (editing) {
    return (
      <div className="field">
        <label htmlFor="rc">Recruited by (their co-maker)</label>
        <select id="rc" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">No recruiter</option>
          {board.map((b) => <option key={b.uid} value={b.uid}>{b.name}</option>)}
        </select>
        {error && <p className="alert" role="alert">{error}</p>}
        <span className="pay-buttons"><button className="btn" onClick={save}>Save</button><button className="copy" onClick={() => setEditing(false)}>Cancel</button></span>
      </div>
    )
  }
  return recruiter
    ? <p className="note" style={{ marginTop: 4 }}>Recruited by <button className="link inline" onClick={() => onOpen(recruiter.uid)}>{recruiter.name}</button> (their co-maker) · <button className="link inline" onClick={() => setEditing(true)}>Change</button></p>
    : <p className="alert" role="status" style={{ marginTop: 8 }}>No recruiter on record, so they can't request loans. <button className="link inline" onClick={() => setEditing(true)}>Set recruiter</button></p>
}

/** Record savings or interest received; it is added to the history (mistakes are voided, never edited). */
function AddTxn({ m, year, onDone }: { m: StoredMember; year: number; onDone: (msg: string) => void }) {
  const [kind, setKind] = useState<'savings' | 'interest'>('savings')
  const [month, setMonth] = useState(ledgerMonth(year))
  const [amount, setAmount] = useState(String(m.heads * 500))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(amount.replace(/[^\d.]/g, '')) || 0
    setBusy(true); setError(null)
    try {
      await addTransaction(m, kind, n, month, note.trim(), year)
      onDone(`Recorded ${peso(n)} ${kind} for ${MONTHS[month]}.`); setNote('')
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <form className="add-txn" onSubmit={submit}>
      <div className="add-txn-row">
        <div className="field"><label htmlFor="tk">Type</label>
          <select id="tk" value={kind} onChange={(e) => { const k = e.target.value as 'savings' | 'interest'; setKind(k); setAmount(k === 'savings' ? String(m.heads * 500) : '') }}>
            <option value="savings">Savings</option><option value="interest">Interest</option>
          </select></div>
        <div className="field"><label htmlFor="tm">For month</label>
          <select id="tm" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}</select></div>
        <div className="field"><label htmlFor="ta">Amount (₱)</label><input id="ta" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      </div>
      <div className="field"><label htmlFor="tn">Note (optional)</label><input id="tn" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid by GCash" /></div>
      {error && <p className="alert" role="alert">{error}</p>}
      <button className="btn wide" disabled={busy}>{busy ? 'Recording…' : 'Record transaction'}</button>
    </form>
  )
}

/** Total unpaid loans: app loans approved but not yet paid, plus the balance typed from the old Borrowers sheet. */
function UnpaidLoans({ m, requests, year }: { m: StoredMember; requests: LoanRequest[]; year: number }) {
  const u = unpaidLoans(requests, m.uid, m.sheetLoanBalance ?? 0)
  const [balance, setBalance] = useState(String(m.sheetLoanBalance ?? 0))
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError(null)
    try { await fn(); setEditing(false); setPaying(null); setPayAmount('') } catch (err) { setError((err as Error).message || "Couldn't save. Check your connection.") } finally { setBusy(null) }
  }
  return (
    <div className={`unpaid ${u.total > 0 ? 'owing' : ''}`}>
      <div className="unpaid-head">
        <span>Unpaid loans</span>
        <b>{peso(u.total)}</b>
      </div>
      <ul className="unpaid-list">
        {u.loans.map((r) => (
          <li key={r.id}>
            <span>
              {r.ref && <b className="ref">{refLabel(r)}</b>}{peso(balanceOf(r))} owed{balanceOf(r) !== r.amount ? ` (borrowed ${peso(r.amount)})` : ''}
              <small>
                approved {new Date(r.decidedAt ?? r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                {monthInterest(r) > 0 ? ` · this month's interest ${peso(monthInterest(r))}` : ` · ${r.quote}`}
                {r.carryovers ? ` · carried over ${r.carryovers}×` : ''}{r.interestPayments ? ` · interest paid ${r.interestPayments}×` : ''}
              </small>
            </span>
            <span className="loan-actions">
              <button className="btn-mini" disabled={busy === r.id}
                onClick={() => window.confirm(`Mark ${m.name}'s loan as fully paid (${peso(balanceOf(r))})?`) && run(r.id, () => markLoanPaid(r.id, year))}>
                Mark as paid
              </button>
              <button className="btn-mini" disabled={busy === r.id}
                onClick={() => window.confirm(`Close this loan WITHOUT recording any money? Use this only for a test loan or one entered by mistake.`) && run(r.id, () => closeLoanNoMoney(r.id))}>
                Close (no money)
              </button>
              {monthInterest(r) > 0 && (<>
                <button className="btn-mini" disabled={busy === r.id}
                  onClick={() => window.confirm(`${m.name} paid this month's interest of ${peso(monthInterest(r))}? The ${peso(balanceOf(r))} balance stays.`) && run(r.id, () => payLoanInterest(r.id, year))}>
                  Pay interest
                </button>
                <button className="btn-mini" disabled={busy === r.id}
                  onClick={() => window.confirm(`Carry over: add ${peso(monthInterest(r))} interest to the balance, making it ${peso(balanceOf(r) + monthInterest(r))}?`) && run(r.id, () => carryOverLoan(r.id, year))}>
                  Carryover
                </button>
                <button className="btn-mini" disabled={busy === r.id} aria-expanded={paying === r.id}
                  onClick={() => { setPaying(paying === r.id ? null : r.id); setPayAmount('') }}>
                  Advance/Custom Payment
                </button>
              </>)}
            </span>
            {paying === r.id && <CustomPay r={r} amount={payAmount} onAmount={setPayAmount} busy={busy === r.id}
              onCancel={() => setPaying(null)}
              onRecord={(n) => run(r.id, () => loanCustomPayment(r.id, year, n))} />}
          </li>
        ))}
        <li>
          {editing ? (
            <span className="balance-edit">
              <label htmlFor="sb">From the old sheet (₱)</label>
              <input id="sb" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
              <button className="btn" disabled={busy === 'sheet'} onClick={() => run('sheet', () => saveSheetLoanBalance(m, Number(balance.replace(/[^\d.]/g, '')) || 0, year))}>Save</button>
              <button className="copy" onClick={() => { setEditing(false); setBalance(String(m.sheetLoanBalance ?? 0)) }}>Cancel</button>
            </span>
          ) : (
            <>
              <span>{peso(u.sheetBalance)} from the old Borrowers sheet</span>
              <button className="btn-mini" onClick={() => setEditing(true)}>Edit</button>
            </>
          )}
        </li>
      </ul>
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  )
}

/** Inline form: how a custom amount splits into interest and balance, before recording it. */
function CustomPay({ r, amount, onAmount, busy, onCancel, onRecord }: {
  r: LoanRequest; amount: string; onAmount: (s: string) => void; busy: boolean; onCancel: () => void; onRecord: (n: number) => void
}) {
  const n = Number(amount.replace(/[^\d.]/g, '')) || 0
  const p = n > 0 ? customPayment(r, n) : null
  return (
    <div className="custom-pay">
      <label htmlFor={`cp-${r.id}`}>Amount paid this month (₱)</label>
      <input id={`cp-${r.id}`} inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} placeholder="e.g. 500" autoFocus />
      {p && ('error' in p
        ? <p className="alert" role="status">{p.error}</p>
        : <p className="note" role="status">
            {peso(p.interestPart)} interest{p.collected > p.interestPart ? ` + ${peso(p.collected - p.interestPart)} carried-over interest` : ''}
            {' · '}{p.paidOff ? 'loan fully paid' : `new balance ${peso(p.balance)}`}
            {p.interestPart < monthInterest(r) ? ` (${peso(monthInterest(r) - p.interestPart)} unpaid interest carries over)` : ''}
          </p>)}
      <span className="pay-buttons">
        <button className="btn" disabled={busy || !p || 'error' in p} onClick={() => onRecord(n)}>Record payment</button>
        <button className="copy" onClick={onCancel}>Cancel</button>
      </span>
    </div>
  )
}

function Confirm({ text, busy, onYes, onNo }: { text: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return <div><p>{text}</p><div className="actions"><button className="btn" disabled={busy} onClick={onYes}>Yes</button><button className="copy" onClick={onNo}>Cancel</button></div></div>
}

// ---------- loan requests ----------
function Requests({ requests, year }: { requests: LoanRequest[]; year: number }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = requests.filter((r) => r.status === 'pending')
  const closed = requests.filter((r) => r.status !== 'pending')
  const decide = async (id: string, s: 'approved' | 'declined', direct = false) => {
    setBusy(id); setError(null)
    try { await adminDecide(id, s, year, direct) } catch (err) { setError((err as Error).message || "Couldn't save. Check your connection.") } finally { setBusy(null) }
  }
  return (
    <section>
      <h1 style={{ fontSize: 22 }}>Loan requests</h1>
      <p className="plan">Approve unlocks once every co-maker has approved (✓). Founders within their limit and deposit loans need none.</p>
      {error && <p className="alert" role="alert">{error}</p>}
      {!pending.length && <p className="note section">No pending requests. When a member asks for a loan it appears here, with a ✓ beside each co-maker who approves.</p>}
      <ul className="requests">
        {pending.map((r) => (
          <RequestCard key={r.id} r={r}>
            <p className="asker">Borrower: <b>{r.borrowerName}</b>{r.overLimit ? ' · over their limit' : ''}{!r.comakerIds.length ? ' · no co-maker needed' : ''}</p>
            <div className="actions">
              <button className="btn" disabled={!canAdminApprove(r) || busy === r.id} onClick={() => decide(r.id, 'approved')}>Approve loan</button>
              <button className="copy" disabled={busy === r.id} onClick={() => decide(r.id, 'declined')}>Decline</button>
              <button className="btn-mini" disabled={busy === r.id}
                onClick={() => window.confirm(`Approve ${r.borrowerName}'s ${peso(r.amount)} loan now, without waiting for the co-makers?`) && decide(r.id, 'approved', true)}>
                Walay Kurat Approve Dritso
              </button>
            </div>
          </RequestCard>
        ))}
      </ul>
      {closed.length > 0 && (
        <div className="section"><h2>Decided</h2>
          <ul className="requests">{closed.map((r) => (
            <RequestCard key={r.id} r={r}>
              <p className="note">Borrower: {r.borrowerName}{r.directApproval ? ' · approved directly, without both co-makers' : ''}</p>
            </RequestCard>
          ))}</ul></div>
      )}
    </section>
  )
}

// ---------- loans: active and closed ----------
function LoansAdmin({ requests, members, year }: { requests: LoanRequest[]; members: StoredMember[]; year: number }) {
  const [view, setView] = useState<'active' | 'closed'>('active')
  // loans approved before references existed get theirs (1FL, 2FL, …) the first time this tab opens
  // loan references for this cycle (13SL #14): numbers every loan once under the scheme, then only new ones
  useEffect(() => { ensureRefs(year).catch(() => {}) }, [requests, year])
  // Savings Loans from before the 10% was added upfront: corrected once (also stops their carried savings counting)
  useEffect(() => { if (requests.some((r) => r.type === 'savings' && r.status === 'approved' && !r.upfront)) fixSavingsLoans(year).catch(() => {}) }, [requests, year])
  const active = requests.filter((r) => r.status === 'approved')
  const closed = requests.filter((r) => r.status === 'paid')
  const list = view === 'active' ? active : closed
  const total = active.reduce((t, r) => t + balanceOf(r), 0)
  const sheet = members.reduce((t, m) => t + (m.sheetLoanBalance ?? 0), 0)
  return (
    <section>
      <h1 style={{ fontSize: 22 }}>Loans</h1>
      <p className="plan">{peso(total)} owed on {active.length} app loan{active.length === 1 ? '' : 's'}{sheet ? ` + ${peso(sheet)} from the old sheet` : ''}</p>
      <div className="segmented" role="tablist" aria-label="Loan category">
        <button role="tab" aria-selected={view === 'active'} onClick={() => setView('active')}>Active Loans ({active.length})</button>
        <button role="tab" aria-selected={view === 'closed'} onClick={() => setView('closed')}>Closed Loans ({closed.length})</button>
      </div>
      {!list.length ? <p className="note section">{view === 'active' ? 'No active loans.' : 'No closed loans yet.'}</p> : (
        <ul className="requests">
          {list.map((r) => (
            <RequestCard key={r.id} r={r}>
              <p className="asker">Borrower: <b>{r.borrowerName}</b></p>
              {view === 'active'
                ? <p className="note">Still owed <b>{peso(balanceOf(r))}</b>{monthInterest(r) > 0 ? ` · this month's interest ${peso(monthInterest(r))}` : ''}. Record payments on the member's page.</p>
                : <p className="note">Paid off {r.paidAt ? new Date(r.paidAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</p>}
            </RequestCard>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------- backup, clear, restore ----------
/** Saves the whole database to a file on this device. */
async function downloadBackup(label = 'backup'): Promise<void> {
  const b = await exportDatabase()
  const stamp = new Date(b.exportedAt).toISOString().slice(0, 16).replace('T', '_').replace(':', '')
  const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `hilas-coop-${label}-${stamp}.json` })
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function BackupRestore() {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [mode, setMode] = useState<'clear' | 'restore' | null>(null)
  const [typed, setTyped] = useState('')
  const [file, setFile] = useState<Backup | null>(null)
  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label); setMsg(null)
    try { setMsg({ ok: true, text: await fn() }); setMode(null); setTyped(''); setFile(null) }
    catch (err) { setMsg({ ok: false, text: (err as Error).message || 'Something went wrong. Check your connection.' }) }
    finally { setBusy(null) }
  }
  const pick = async (f: File | undefined) => {
    setMsg(null); setFile(null)
    if (!f) return
    const b = parseBackup(await f.text())
    if ('error' in b) setMsg({ ok: false, text: b.error }); else setFile(b)
  }
  const s = file ? backupSummary(file) : null
  return (
    <div className="section backup">
      <h2>Backup & restore</h2>
      <p className="note">A backup is one file with every member, loan, transaction and total (names and money, no passwords). Keep it private.</p>
      <button className="btn wide" disabled={!!busy} onClick={() => run('download', async () => { await downloadBackup(); return 'Backup downloaded. Keep the file somewhere safe.' })}>
        {busy === 'download' ? 'Preparing…' : 'Download backup'}
      </button>
      <div className="actions">
        <button className="copy" disabled={!!busy} onClick={() => { setMode(mode === 'restore' ? null : 'restore'); setTyped(''); setMsg(null) }}>Restore from backup</button>
        <button className="copy danger" disabled={!!busy} onClick={() => { setMode(mode === 'clear' ? null : 'clear'); setTyped(''); setMsg(null) }}>Clear database</button>
      </div>

      {mode === 'restore' && (
        <div className="custom-pay" style={{ marginTop: 12 }}>
          <label htmlFor="bf">Backup file</label>
          <input id="bf" type="file" accept="application/json,.json" onChange={(e) => pick(e.target.files?.[0])} />
          {s && <p className="note">Backup from {new Date(s.exportedAt).toLocaleString('en-PH')}: {s.members} members, {s.loanRequests} loans, {s.transactions} transactions. Restoring replaces everything now in the app with this.</p>}
          {s && <>
            <label htmlFor="rt">Type <b>RESTORE</b> to replace the database</label>
            <input id="rt" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </>}
          <span className="pay-buttons">
            <button className="btn" disabled={!file || typed.trim() !== 'RESTORE' || !!busy}
              onClick={() => run('restore', async () => { await downloadBackup('before-restore'); await restoreDatabase(file!, setBusy); return 'Restored. (A backup of what was there before was downloaded first.)' })}>
              {busy && busy !== 'download' ? busy : 'Restore'}
            </button>
            <button className="copy" onClick={() => setMode(null)}>Cancel</button>
          </span>
        </div>
      )}

      {mode === 'clear' && (
        <div className="custom-pay" style={{ marginTop: 12, borderColor: 'var(--red)' }}>
          <p className="alert" role="status" style={{ marginTop: 0 }}>This deletes every member, loan, transaction and total. A backup downloads first so you can restore it. Logins (passwords) are kept.</p>
          <label htmlFor="ct2">Type <b>CLEAR</b> to delete everything</label>
          <input id="ct2" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <span className="pay-buttons">
            <button className="btn danger" disabled={typed.trim() !== 'CLEAR' || !!busy}
              onClick={() => run('clear', async () => { await downloadBackup('before-clear'); await clearDatabase(setBusy); return 'Database cleared. The backup file you just downloaded can restore it.' })}>
              {busy && busy !== 'download' ? busy : 'Clear database'}
            </button>
            <button className="copy" onClick={() => setMode(null)}>Cancel</button>
          </span>
        </div>
      )}
      {msg && <p className={msg.ok ? 'success' : 'alert'} role="status">{msg.text}</p>}
    </div>
  )
}

// ---------- coop, import, new cycle ----------
function CoopAdmin({ members, summary, year }: { members: StoredMember[]; summary: Summary | null; year: number }) {
  const [progress, setProgress] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const next = year + 1
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try { await fn() } catch (err) { setError((err as Error).message) } finally { setProgress(null) }
  }
  return (
    <section>
      <h1 style={{ fontSize: 22 }}>Coop {year}</h1>
      <CoopSection summary={summary} />
      {summary && <p className="note">Top borrower: {coopSummary(members).top?.name ?? 'none yet'} (only the admin sees this)</p>}
      <button className="copy wide section" disabled={!!progress} onClick={() => run(async () => { setProgress('Recalculating…'); await rebuildAllLedgers(year) })}>
        Rebuild every member's totals
      </button>



      <div className="section">
        <h2>Start the {next} cycle</h2>
        <p className="note">Deletes every member, login and loan request so the new year starts empty. You then add {next}'s members. This can't be undone.</p>
        <div className="field"><label htmlFor="cy">Type <b>START {next}</b> to confirm</label>
          <input id="cy" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></div>
        <button className="btn danger wide" disabled={typed.trim() !== `START ${next}` || !!progress} onClick={() => run(async () => { setProgress('Starting…'); await startCycle(next); setTyped('') })}>
          Start {next} cycle
        </button>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <BackupRestore />
      <div className="section"><button className="copy wide" onClick={() => signOutUser()}>Log out</button></div>
    </section>
  )
}
