import { useEffect, useState } from 'react'
import { AdminApp } from './AdminApp'
import { DialogHost } from './dialog'
import { Login } from './Login'
import { StatusBars } from './pwa'
import { MemberApp } from './MemberApp'
import { DEFAULT_CYCLE_YEAR } from './rules'
import { Loading, Shell } from './Shell'
import { onSession, watchCycle, type Session } from './store'

/** Routes by who is signed in: nobody → Login, the admin → AdminApp, a member → MemberApp. */
export default function App() {
  const [session, setSession] = useState<Session | undefined>(undefined)
  const [year, setYear] = useState(DEFAULT_CYCLE_YEAR)
  useEffect(() => onSession(setSession), [])
  useEffect(() => (session ? watchCycle(setYear) : undefined), [session])

  return <><StatusBars />{screen(session, year)}<DialogHost /></>
}

function screen(session: Session | null | undefined, year: number) {
  if (session === undefined) return <Shell year={year}><Loading /></Shell>
  if (session === null) return <Login year={year} />
  if (session.kind === 'admin') return <AdminApp year={year} />
  return <MemberApp key={session.uid} uid={session.uid} year={year} />
}
