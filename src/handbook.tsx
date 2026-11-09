import { useEffect, useState, type FormEvent } from 'react'
import { saveHandbookLink, watchHandbook, type Handbook } from './store'

/** Why a pasted link can't be the handbook, or null. Only https links, so it can't run anything in the app. */
export function handbookLinkProblem(text: string): string | null {
  let url: URL
  try { url = new URL(text.trim()) } catch { return 'Paste the full link, starting with https://' }
  if (url.protocol !== 'https:') return 'The link must start with https://'
  return null
}

const when = (ms: number) => new Date(ms).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })

function useHandbook() {
  const [h, setH] = useState<Handbook | undefined>(undefined)
  useEffect(() => watchHandbook(setH), [])
  return h
}

/** Members: Pay & Rules tab, at the bottom. Opens the handbook in a new tab to read or download. */
export function HandbookDownload() {
  const h = useHandbook()
  if (h === undefined) return null
  return (
    <div className="section">
      <h2>Handbook</h2>
      {h ? <a className="btn wide" href={h.url} target="_blank" rel="noopener noreferrer">Open the handbook</a>
        : <p className="note">The handbook will be here once the admin adds it.</p>}
    </div>
  )
}

/** Admin: Coop tab. Shows the current handbook link and saves a new one. */
export function HandbookAdmin() {
  const h = useHandbook()
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const problem = handbookLinkProblem(link)
    if (problem) return setMsg({ ok: false, text: problem })
    setBusy(true); setMsg(null)
    try { await saveHandbookLink(link.trim()); setLink(''); setMsg({ ok: true, text: 'Saved. Members see it on Pay & Rules.' }) }
    catch (err) { setMsg({ ok: false, text: (err as Error).message || "Couldn't save. Check your connection." }) } finally { setBusy(false) }
  }
  return (
    <form className="section" onSubmit={save} noValidate>
      <h2>Handbook</h2>
      {h === undefined ? <p className="note">Loading…</p> : h ? (
        <>
          <ul className="rows panel">
            <li><span>Link</span><b className="handbook-link">{h.url}</b></li>
            <li><span>Updated</span><b>{when(h.updatedAt)}</b></li>
          </ul>
          <div className="actions"><a className="copy" href={h.url} target="_blank" rel="noopener noreferrer">Open</a></div>
        </>
      ) : <p className="note">No handbook yet. Members see an Open the handbook button on Pay &amp; Rules once you add the link.</p>}
      <div className="field">
        <label htmlFor="hb">{h ? 'New Google Drive link' : 'Google Drive link'}</label>
        <input id="hb" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" autoComplete="off" />
      </div>
      <p className="note">In Google Drive, set the file's sharing to "Anyone with the link" (Viewer) so members can open it without asking.</p>
      {msg && <p className={msg.ok ? 'success' : 'alert'} role="status">{msg.text}</p>}
      <button className="btn wide" disabled={busy || !link.trim()}>{busy ? 'Saving…' : 'Save link'}</button>
    </form>
  )
}
