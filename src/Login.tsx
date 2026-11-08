import { useState, type FormEvent } from 'react'
import { Shell } from './Shell'
import { signIn } from './store'

export function Login({ year }: { year: number }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await signIn(name, password) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <Shell year={year}>
      <form className="login" onSubmit={submit}>
        <h1>Log in</h1>
        <p className="note">Use your full name. Your first password is your name with no spaces, e.g. <b>JuanDelaCruz</b>.</p>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoCapitalize="words" required />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        <button className="btn wide" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <p className="tagline">Save Together, Help Each Other, Share the Rewards.</p>
      </form>
    </Shell>
  )
}
