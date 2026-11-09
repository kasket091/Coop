import { useEffect, useRef, useState, type FormEvent } from 'react'

// In-page replacements for window.prompt/confirm: some browsers and in-app webviews (and the preview pane) block those.
type Ask = { text: string; input?: string; resolve: (v: string | null) => void }
let show: ((a: Ask) => void) | null = null
const ask = (text: string, input?: string) => new Promise<string | null>((resolve) => (show ? show({ text, input, resolve }) : resolve(null)))

/** Asks for a typed answer (e.g. a reason); null when cancelled. */
export const askText = (text: string, value = '') => ask(text, value)
/** Yes / Cancel. */
export const askYes = async (text: string) => (await ask(text)) !== null

/** Mounted once at the app root. */
export function DialogHost() {
  const [cur, setCur] = useState<Ask | null>(null)
  const [value, setValue] = useState('')
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { show = (a) => { setValue(a.input ?? ''); setCur(a) }; return () => { show = null } }, [])
  useEffect(() => { if (cur && !ref.current?.open) ref.current?.showModal() }, [cur])
  const close = (v: string | null) => { cur?.resolve(v); setCur(null); ref.current?.close() }
  const typed = cur?.input !== undefined
  const submit = (e: FormEvent) => { e.preventDefault(); if (!typed || value.trim()) close(typed ? value.trim() : '') }
  return (
    <dialog ref={ref} className="ask" aria-labelledby="ask-text" onCancel={(e) => { e.preventDefault(); close(null) }}>
      {cur && (
        <form onSubmit={submit}>
          <p id="ask-text">{cur.text}</p>
          {typed && <input autoFocus aria-labelledby="ask-text" value={value} onChange={(e) => setValue(e.target.value)} />}
          <div className="actions">
            <button className="btn" disabled={typed && !value.trim()}>{typed ? 'OK' : 'Yes'}</button>
            <button type="button" className="copy" onClick={() => close(null)}>Cancel</button>
          </div>
        </form>
      )}
    </dialog>
  )
}
