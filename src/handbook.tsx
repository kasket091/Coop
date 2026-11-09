import { useEffect, useRef, useState, type ChangeEvent } from 'react'

export type HandbookInfo = { url: string; name: string; size: number; updated: number }
export const MAX_HANDBOOK_MB = 25

/** Why a chosen file can't be the handbook, or null. */
export function handbookProblem(f: { name: string; type: string; size: number }): string | null {
  if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return 'The handbook must be a PDF file.'
  if (f.size > MAX_HANDBOOK_MB * 1024 * 1024) return `That file is over ${MAX_HANDBOOK_MB} MB. Save a smaller PDF and try again.`
  if (f.size === 0) return 'That file is empty.'
  return null
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const when = (ms: number) => new Date(ms).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
const load = () => import('./handbook-files')

/** Loads the current handbook; `undefined` while loading, `null` when there is none. */
function useHandbook() {
  const [info, setInfo] = useState<HandbookInfo | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const refresh = () => load().then((h) => h.handbookInfo()).then(setInfo, () => { setInfo(null); setError("Couldn't load the handbook. Check your connection.") })
  useEffect(() => { refresh() }, [])
  return { info, error, setError, refresh }
}

/** Members: Pay & Rules tab, at the bottom. */
export function HandbookDownload() {
  const { info, error } = useHandbook()
  if (info === undefined) return null
  return (
    <div className="section">
      <h2>Handbook</h2>
      {info
        ? <a className="btn wide" href={info.url} target="_blank" rel="noopener">Download the handbook (PDF, {mb(info.size)})</a>
        : <p className="note">{error ?? 'The handbook will be here once the admin uploads it.'}</p>}
    </div>
  )
}

/** Admin: Coop tab. Shows the current handbook and uploads a new one (it replaces the old). */
export function HandbookAdmin() {
  const { info, error, setError, refresh } = useHandbook()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null); setDone(false)
    const problem = handbookProblem(f)
    if (problem) return setError(problem)
    setBusy(true)
    try { await (await load()).uploadHandbook(f); await refresh(); setDone(true) } catch (err) { setError((err as Error).message || "Couldn't upload. Check your connection.") } finally { setBusy(false) }
  }
  return (
    <div className="section">
      <h2>Handbook</h2>
      {info === undefined ? <p className="note">Loading…</p> : info ? (
        <ul className="rows panel">
          <li><span>File</span><b>{info.name}</b></li>
          <li><span>Uploaded</span><b>{when(info.updated)}</b></li>
          <li><span>Size</span><b>{mb(info.size)}</b></li>
        </ul>
      ) : <p className="note">No handbook uploaded yet. Members see a Download button on Pay &amp; Rules once you upload one.</p>}
      <div className="actions">
        {info && <a className="copy" href={info.url} target="_blank" rel="noopener">Download</a>}
        <button className="btn" disabled={busy} onClick={() => picker.current?.click()}>
          {busy ? 'Uploading…' : info ? 'Upload new handbook' : 'Upload handbook'}
        </button>
        <input ref={picker} type="file" accept="application/pdf,.pdf" onChange={choose} hidden />
      </div>
      <p className="note">PDF only, up to {MAX_HANDBOOK_MB} MB. A new upload replaces the current one for everyone.</p>
      {done && <p className="success" role="status">Handbook uploaded. Members can download it now.</p>}
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  )
}
