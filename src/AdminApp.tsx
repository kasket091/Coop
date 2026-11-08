import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { startingPassword } from './accounts'
import { MONTHS, peso } from './format'
import { IconCoop, IconLoans, IconSavings } from './icons'
import { RequestCard } from './member-tabs'
import { canAdminApprove, unpaidLoans, type LoanRequest } from './requests'
import { coopSummary } from './rules'
import { CoopSection, MySavings } from './savings'
import { Loading, Shell, type TabDef } from './Shell'
import {
  addMember, adminDecide, deleteMember, importFromSheet, markLoanPaid, recomputeSummary, renameMember, resetLogin, savePayments,
  saveSheetLoanBalance,
  signOutUser, startCycle, watchAllMembers, watchAllRequests, watchSummary, type StoredMember, type Summary,
} from './store'

type Tab = 'members' | 'requests' | 'coop'
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function AdminApp({ year }: { year: number }) {
  const [members, setMembers] = useState<StoredMember[] | null>(null)
  const [requests, setRequests] = useState<LoanRequest[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [tab, setTab] = useState<Tab>('members')
  useEffect(() => watchAllMembers(setMembers), [])
  useEffect(() => watchAllRequests(setRequests), [])
  useEffect(() => watchSummary(setSummary), [])

  const ready = requests.filter(canAdminApprove).length
  const tabs: TabDef<Tab>[] = [
    { id: 'members', label: 'Members', Icon: IconSavings },
    { id: 'requests', label: 'Requests', Icon: IconLoans, badge: ready },
    { id: 'coop', label: 'Coop', Icon: IconCoop },
  ]
  return (
    <Shell year={year} tabs={tabs} current={tab} onTab={setTab}>
      <p className="admin-flag">Admin</p>
      {!members ? <Loading />
        : tab === 'members' ? <Members members={members} requests={requests} year={year} />
        : tab === 'requests' ? <Requests requests={requests} />
        : <CoopAdmin members={members} summary={summary} year={year} />}
    </Shell>
  )
}

// ---------- members ----------
function Members({ members, requests, year }: { members: StoredMember[]; requests: LoanRequest[]; year: number }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const selected = members.find((m) => m.uid === open)
  const back = (msg?: string) => { setOpen(null); setNotice(msg ?? null); window.scrollTo(0, 0) }
  const show = (uid: string) => { setOpen(uid); window.scrollTo(0, 0) }
  if (selected) return <MemberDetail m={selected} members={members} requests={requests} year={year} onBack={back} />
  if (adding) return <AddMember year={year} onDone={() => setAdding(false)} />
  const list = members.filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <section className="picker">
      <div className="who"><h1>Members</h1><button className="btn" onClick={() => setAdding(true)}>Add member</button></div>
      <p className="plan">{members.filter((m) => m.heads > 0).length} members · {sum(members.map((m) => m.heads))} heads</p>
      {notice && <p className="success" role="status">{notice}</p>}
      <div className="field"><label htmlFor="mq">Search</label>
        <input id="mq" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></div>
      <ul className="panel">
        {list.map((m) => (
          <li key={m.uid}><button onClick={() => show(m.uid)}>
            {m.name}{m.founder ? ' ★' : ''}
            <span>{m.heads ? `${m.heads} heads · ${peso(sum(m.paid))}` : 'left · interest only'}</span>
          </button></li>
        ))}
        {!list.length && <li className="note" style={{ padding: 16 }}>{members.length ? `No member named “${q}”.` : 'No members yet. Add one, or import the 2026 sheet from the Coop tab.'}</li>}
      </ul>
      <p className="note">★ founding member (can be a co-maker)</p>
    </section>
  )
}

function AddMember({ year, onDone }: { year: number; onDone: () => void }) {
  const [name, setName] = useState('')
  const [heads, setHeads] = useState('2')
  const [founder, setFounder] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const h = Number(heads)
    if (!Number.isInteger(h) || h < 2 || h > 14) return setError('Heads must be a whole number from 2 to 14.')
    setBusy(true); setError(null)
    try { await addMember({ name, heads: h, founder, year }); setDone(name.trim()) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
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
      <label className="check"><input type="checkbox" checked={founder} onChange={(e) => setFounder(e.target.checked)} /> Founding member (can be a co-maker)</label>
      {error && <p className="alert" role="alert">{error}</p>}
      <button className="btn wide" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
    </form>
  )
}

function MemberDetail({ m, members, requests, year, onBack }: {
  m: StoredMember; members: StoredMember[]; requests: LoanRequest[]; year: number; onBack: (notice?: string) => void
}) {
  const [paid, setPaid] = useState(m.paid.map(String))
  const [interest, setInterest] = useState(m.interest.map(String))
  const [heads, setHeads] = useState(String(m.heads))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'reset' | 'rename' | null>(null)
  const [typed, setTyped] = useState('')
  const coop = useMemo(() => coopSummary(members), [members])

  const num = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const p = paid.map(num), i = interest.map(num), h = num(heads)
      await savePayments(m.uid, p, i, h)
      await recomputeSummary(members.map((x) => (x.uid === m.uid ? { ...x, paid: p, interest: i, heads: h } : x)))
      setMsg({ ok: true, text: 'Saved. Coop totals updated.' })
    } catch { setMsg({ ok: false, text: "Couldn't save. Check your connection." }) } finally { setBusy(false) }
  }
  const act = async () => {
    setBusy(true); setMsg(null)
    try {
      if (confirm === 'delete') { await deleteMember(m); onBack(`${m.name} was deleted.`); return }
      if (confirm === 'reset') { await resetLogin(m); onBack(`${m.name}'s login was reset. Their password is now ${startingPassword(m.name)}.`); return }
      if (confirm === 'rename') { await renameMember(m, typed); setMsg({ ok: true, text: 'Renamed. They log in with the new name.' }) }
      setConfirm(null); setTyped('')
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }) } finally { setBusy(false) }
  }

  return (
    <section>
      <MySavings m={m} coop={coop} year={year} action={<button className="link" onClick={() => onBack()}>Back</button>}
        extra={<UnpaidLoans m={m} requests={requests} />} />
      <div className="section">
        <h2>Record payments and interest</h2>
        <div className="field"><label htmlFor="eh">Heads</label><input id="eh" inputMode="numeric" value={heads} onChange={(e) => setHeads(e.target.value)} /></div>
        <table className="ledger panel">
          <thead><tr><th scope="col">Month</th><th scope="col">Savings paid</th><th scope="col">Interest paid</th></tr></thead>
          <tbody>
            {MONTHS.map((mo, i) => (
              <tr key={mo}>
                <th scope="row">{mo}</th>
                <td><input aria-label={`${mo} savings`} inputMode="decimal" value={paid[i]} onChange={(e) => setPaid((p) => p.map((v, j) => (j === i ? e.target.value : v)))} /></td>
                <td><input aria-label={`${mo} interest`} inputMode="decimal" value={interest[i]} onChange={(e) => setInterest((p) => p.map((v, j) => (j === i ? e.target.value : v)))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {msg && <p className={msg.ok ? 'success' : 'alert'} role="status">{msg.text}</p>}
        <button className="btn wide" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
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

/** Total unpaid loans: app loans approved but not yet paid, plus the balance typed from the old Borrowers sheet. */
function UnpaidLoans({ m, requests }: { m: StoredMember; requests: LoanRequest[] }) {
  const u = unpaidLoans(requests, m.uid, m.sheetLoanBalance ?? 0)
  const [balance, setBalance] = useState(String(m.sheetLoanBalance ?? 0))
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError(null)
    try { await fn(); setEditing(false) } catch (err) { setError((err as Error).message || "Couldn't save. Check your connection.") } finally { setBusy(null) }
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
            <span>{peso(r.amount)} · approved {new Date(r.decidedAt ?? r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}<small>{r.quote}</small></span>
            <button className="btn-mini" disabled={busy === r.id}
              onClick={() => window.confirm(`Mark ${m.name}'s ${peso(r.amount)} loan as fully paid?`) && run(r.id, () => markLoanPaid(r.id))}>
              Mark as paid
            </button>
          </li>
        ))}
        <li>
          {editing ? (
            <span className="balance-edit">
              <label htmlFor="sb">From the old sheet (₱)</label>
              <input id="sb" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
              <button className="btn" disabled={busy === 'sheet'} onClick={() => run('sheet', () => saveSheetLoanBalance(m.uid, Number(balance.replace(/[^\d.]/g, '')) || 0))}>Save</button>
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

function Confirm({ text, busy, onYes, onNo }: { text: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return <div><p>{text}</p><div className="actions"><button className="btn" disabled={busy} onClick={onYes}>Yes</button><button className="copy" onClick={onNo}>Cancel</button></div></div>
}

// ---------- loan requests ----------
function Requests({ requests }: { requests: LoanRequest[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = requests.filter((r) => r.status === 'pending')
  const closed = requests.filter((r) => r.status !== 'pending')
  const decide = async (id: string, s: 'approved' | 'declined', direct = false) => {
    setBusy(id); setError(null)
    try { await adminDecide(id, s, direct) } catch (err) { setError((err as Error).message || "Couldn't save. Check your connection.") } finally { setBusy(null) }
  }
  return (
    <section>
      <h1 style={{ fontSize: 22 }}>Loan requests</h1>
      <p className="plan">Approve unlocks once both co-makers have approved (✓).</p>
      {error && <p className="alert" role="alert">{error}</p>}
      {!pending.length && <p className="note section">No pending requests. When a member asks for a loan it appears here, with a ✓ beside each co-maker who approves.</p>}
      <ul className="requests">
        {pending.map((r) => (
          <RequestCard key={r.id} r={r}>
            <p className="asker">Borrower: <b>{r.borrowerName}</b></p>
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
      <button className="copy wide section" onClick={() => run(() => recomputeSummary(members))}>Recalculate totals</button>

      {year === 2026 && (
        <div className="section">
          <h2>Import the 2026 sheet</h2>
          <p className="note">Creates every member's login and copies their savings and interest from the Google Sheet. If it stops partway, run it again: members already imported are skipped.</p>
          <button className="btn wide" disabled={!!progress} onClick={() => run(() => importFromSheet((d, t) => setProgress(`Importing ${d} of ${t}…`)))}>
            {progress ?? 'Import from sheet'}
          </button>
        </div>
      )}

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
      <div className="section"><button className="copy wide" onClick={() => signOutUser()}>Log out</button></div>
    </section>
  )
}
