// Members send a payment for the admin to check: Pay Now on a loan, Pay savings on the Savings tab. Nothing is
// recorded until the admin approves it (Payment Request tab); the amounts and preview follow payments.ts.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { tell } from './dialog'
import { dueDay, MONTHS, peso } from './format'
import { shrinkImage } from './image'
import type { Txn } from './ledger'
import { choiceAmount, choicePreview, previewText, savingsPayMonth, savingsPayOpen, unpaidInterestMonths, type PayChoice, type PaymentRequest } from './payments'
import { balanceOf, interestDueNow, refLabel, type LoanRequest } from './requests'
import { monthlyDue } from './rules'
import { sendPaymentRequest, type StoredMember } from './store'
import { PaymentAccounts, TYPES } from './tabs'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const loanLabel = (r: LoanRequest) => [refLabel(r), TYPES[r.type]].filter(Boolean).join(' · ')

/** A modal pop-up that opens when shown; closing it (Cancel, Esc, after sending) calls `onClose`. */
function PayDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return (
    <dialog ref={ref} className="ask pay" aria-labelledby="pay-title" onClose={onClose}>
      <h2 id="pay-title">{title}</h2>
      {children}
    </dialog>
  )
}

/** The screenshot field, with a small preview once picked. */
function ProofField({ image, onImage, onError }: { image: string; onImage: (s: string) => void; onError: (s: string) => void }) {
  return (
    <div className="field">
      <label htmlFor="pay-proof">Screenshot of your payment</label>
      <input id="pay-proof" type="file" accept="image/*"
        onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { onImage(await shrinkImage(f)) } catch (err) { onError((err as Error).message) } }} />
      {image && <img className="proof-thumb" src={image} alt="Your payment screenshot" />}
    </div>
  )
}

/** Send and Cancel; Send waits for an amount and a screenshot. */
function SendRow({ ready, onSend, onCancel }: { ready: boolean; onSend: () => Promise<void>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="actions">
      <button className="btn" disabled={!ready || busy} onClick={async () => { setBusy(true); try { await onSend() } finally { setBusy(false) } }}>Send</button>
      <button type="button" className="copy" onClick={onCancel}>Cancel</button>
    </div>
  )
}

const sent = () => tell('Sent. The admin will check your payment and record it. You will get a notification.')

/** Pay Now on one loan: Interest, Full payment or Custom Payment (with the months of missed interest to tick). */
export function PayLoanDialog({ me, loan, loans, txns, onClose }: { me: StoredMember; loan: LoanRequest; loans: LoanRequest[]; txns: Txn[]; onClose: () => void }) {
  const now = Date.now()
  const interest = choiceAmount(loan, txns, 'interest', now)
  const months = unpaidInterestMonths(loan, txns)
  const [choice, setChoice] = useState<PayChoice>(interest > 0 ? 'interest' : 'full')
  const [ticked, setTicked] = useState<number[]>([])
  const [typed, setTyped] = useState('')
  const [image, setImage] = useState('')
  const [error, setError] = useState('')
  const amount = choice === 'custom' ? Number(typed.replace(/[^\d.]/g, '')) || 0 : choiceAmount(loan, txns, choice, now)
  const preview = amount > 0 ? choicePreview(loan, txns, amount, now) : null
  const tick = (period: number) => {
    const next = ticked.includes(period) ? ticked.filter((p) => p !== period) : [...ticked, period]
    setTicked(next)
    const total = months.filter((m) => next.includes(m.period)).reduce((t, m) => t + m.amount, 0)
    setTyped(total ? String(Math.round(total * 100) / 100) : '')
  }
  const close = () => onClose()
  const send = async () => {
    setError('')
    try {
      await sendPaymentRequest({
        memberId: me.uid, memberName: me.name, kind: 'loan', loanId: loan.id, loanLabel: loanLabel(loan), choice, amount,
        months: choice === 'custom' && ticked.length ? months.filter((m) => ticked.includes(m.period)).map((m) => dueDay(m.dueAt)) : undefined,
      }, image)
      close(); await sent()
    } catch (err) { setError((err as Error).message || "Couldn't send. Check your connection.") }
  }
  const options: [PayChoice, string][] = [
    ...(interest > 0 ? [['interest', `Interest · ${peso(interest)}`] as [PayChoice, string]] : []),
    ['full', `Full payment · ${peso(balanceOf(loan))}`],
    ['custom', 'Custom Payment'],
  ]
  return (
    <PayDialog title={`Pay ${loanLabel(loan)}`} onClose={close}>
      <p className="note">Still owed {peso(balanceOf(loan))}{interest > 0 ? ` · interest due now ${peso(interest)}` : ''}</p>
      <fieldset className="pay-choice">
        <legend>What are you paying?</legend>
        {options.map(([c, label]) => (
          <label key={c}><input type="radio" name="pay-choice" checked={choice === c} onChange={() => setChoice(c)} /> {label}</label>
        ))}
      </fieldset>
      {choice === 'custom' && <>
        {months.length > 0 && (
          <fieldset className="pay-choice">
            <legend>Missed interest to pay (oldest is paid first)</legend>
            {months.map((m) => (
              <label key={m.period}><input type="checkbox" checked={ticked.includes(m.period)} onChange={() => tick(m.period)} /> {dueDay(m.dueAt)} · {peso(m.amount)}</label>
            ))}
          </fieldset>
        )}
        <div className="field"><label htmlFor="pay-amount">Amount (₱)</label>
          <input id="pay-amount" inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. 5000" /></div>
      </>}
      {preview && ('error' in preview
        ? <p className="alert" role="status">{preview.error}</p>
        : <p className="note" role="status">{previewText(preview, amount, interestDueNow(loan, txns, now))}</p>)}
      <details className="pay-loans">
        <summary>Your loans</summary>
        <ul className="rows">
          {loans.map((r) => (
            <li key={r.id}><span>{loanLabel(r)}</span><b>{peso(balanceOf(r))}{interestDueNow(r, txns, now) > 0 ? ` · ${peso(interestDueNow(r, txns, now))} interest due` : ''}</b></li>
          ))}
        </ul>
      </details>
      <ProofField image={image} onImage={setImage} onError={setError} />
      <PaymentAccounts />
      {error && <p className="alert" role="alert">{error}</p>}
      <SendRow ready={amount > 0 && !!image && !!preview && !('error' in preview)} onSend={send} onCancel={() => close()} />
    </PayDialog>
  )
}

/**
 * Pay savings, above the savings total: this month only, open from the 1st to the 7th. Hidden once the month is paid
 * (or a request for it is waiting) and for a terminated account.
 */
export function PaySavingsButton({ me, year, waiting }: { me: StoredMember; year: number; waiting: PaymentRequest[] }) {
  const [open, setOpen] = useState(false)
  const now = new Date()
  const month = savingsPayMonth(now)
  const due = monthlyDue(me.heads)
  const left = Math.max(0, due - (me.paid[month] ?? 0))
  const pending = waiting.find((p) => p.kind === 'savings' && p.month === month && p.status === 'pending')
  if (me.terminated || !left) return null
  if (pending) return <p className="note">{MONTH_NAMES[month]} savings of {peso(pending.amount)} sent; waiting for the admin.</p>
  if (!savingsPayOpen(now, year)) {
    return <><button className="btn wide" disabled>Pay savings</button><p className="note">Savings for {MONTH_NAMES[month]} closed on the 7th. Message the admin.</p></>
  }
  return <>
    <button className="btn wide" onClick={() => setOpen(true)}>Pay savings</button>
    {open && <PaySavingsDialog me={me} month={month} left={left} onClose={() => setOpen(false)} />}
  </>
}

function PaySavingsDialog({ me, month, left, onClose }: { me: StoredMember; month: number; left: number; onClose: () => void }) {
  const [typed, setTyped] = useState(String(left))
  const [image, setImage] = useState('')
  const [error, setError] = useState('')
  const amount = Number(typed.replace(/[^\d.]/g, '')) || 0
  const send = async () => {
    setError('')
    try {
      await sendPaymentRequest({ memberId: me.uid, memberName: me.name, kind: 'savings', month, amount }, image)
      onClose(); await sent()
    } catch (err) { setError((err as Error).message || "Couldn't send. Check your connection.") }
  }
  return (
    <PayDialog title={`Pay ${MONTH_NAMES[month]} savings`} onClose={onClose}>
      <p className="note">{me.heads} heads · {peso(monthlyDue(me.heads))} a month · due by {MONTHS[month]} 7</p>
      <div className="field"><label htmlFor="pay-savings">Amount (₱)</label>
        <input id="pay-savings" inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} /></div>
      <ProofField image={image} onImage={setImage} onError={setError} />
      <PaymentAccounts />
      {error && <p className="alert" role="alert">{error}</p>}
      <SendRow ready={amount > 0 && !!image} onSend={send} onCancel={onClose} />
    </PayDialog>
  )
}

/** The member's payments sent: waiting ones (with Withdraw) and ones rejected in the last 30 days, with the reason. */
export function MyPayments({ list, onWithdraw }: { list: PaymentRequest[]; onWithdraw: (p: PaymentRequest) => void }) {
  const shown = list.filter((p) => p.status === 'pending' || (p.status === 'rejected' && Date.now() - (p.decidedAt ?? 0) < 30 * 86_400_000))
  if (!shown.length) return null
  return (
    <div className="section">
      <h2>Payments sent</h2>
      <ul className="rows panel">
        {shown.map((p) => (
          <li key={p.id}>
            <span>{p.kind === 'savings' ? `${MONTH_NAMES[p.month ?? 0]} savings` : p.loanLabel} · {dueDay(p.createdAt)}
              <small className="advance-sub">{p.status === 'pending' ? 'Waiting for the admin' : `Not accepted: ${p.reason}`}</small></span>
            <b>{peso(p.amount)}{p.status === 'pending' && <> <button className="btn-mini" onClick={() => onWithdraw(p)}>Withdraw</button></>}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
