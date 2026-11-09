import { lazy, Suspense, useEffect, useState } from 'react'
import { DialogHost } from './dialog'
import { Login } from './Login'
import { StatusBars } from './pwa'
import { DEFAULT_CYCLE_YEAR } from './rules'
import { Loading, Shell } from './Shell'
import { onSession, watchCycle, type Session } from './store'

// Split download: members never fetch the admin screens; the member screens start downloading at once, alongside
// the sign-in check, so they are ready by the time the session is known.
const loadMember = () => import('./MemberApp').then((m) => ({ default: m.MemberApp }))
const MemberApp = lazy(loadMember)
const AdminApp = lazy(() => import('./AdminApp').then((m) => ({ default: m.AdminApp })))
loadMember()

/** Routes by who is signed in: nobody → Login, the admin → AdminApp, a member → MemberApp. */
export default function App() {
  const [session, setSession] = useState<Session | undefined>(undefined)
  const [year, setYear] = useState(DEFAULT_CYCLE_YEAR)
  useEffect(() => onSession(setSession), [])
  useEffect(() => (session ? watchCycle(setYear) : undefined), [session])
  // a phone that already allowed notifications re-saves its token (they can change) under whoever signed in;
  // a few seconds later, so it doesn't compete with loading the member's figures
  useEffect(() => {
    if (!session) return
    const id = setTimeout(() => import('./push').then((p) => p.enablePush(false)).catch(() => {}), 4000)
    return () => clearTimeout(id)
  }, [session])

  const loading = <Shell year={year}><Loading /></Shell>
  return <><StatusBars /><Suspense fallback={loading}>{screen(session, year, loading)}</Suspense><DialogHost /></>
}

function screen(session: Session | null | undefined, year: number, loading: JSX.Element) {
  if (session === undefined) return loading
  if (session === null) return <Login year={year} />
  if (session.kind === 'admin') return <AdminApp year={year} />
  return <MemberApp key={session.uid} uid={session.uid} year={year} />
}
