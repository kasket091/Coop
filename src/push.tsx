import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import { useEffect, useState } from 'react'
import { app } from './firebase'
import { savePushToken } from './store'

export type PushState = 'unsupported' | 'install-first' | 'off' | 'blocked' | 'on'

const iPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export async function pushState(): Promise<PushState> {
  if (iPhone() && !installed()) return 'install-first' // iPhone only allows notifications for Home Screen apps
  // the service worker (which shows them) only runs on the live site
  if (!import.meta.env.PROD || !('Notification' in window) || !(await isSupported().catch(() => false))) return 'unsupported'
  return Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off'
}

/** Asks permission (only when `ask`), then saves this phone's token. Also run at each app start: tokens can change. */
export async function enablePush(ask: boolean): Promise<PushState> {
  let state = await pushState()
  if (state === 'off' && ask) state = (await Notification.requestPermission()) === 'granted' ? 'on' : await pushState()
  if (state !== 'on') return state
  const token = await getToken(getMessaging(app), { serviceWorkerRegistration: await navigator.serviceWorker.ready })
  await savePushToken(token)
  return 'on'
}

const WHAT = {
  member: 'when someone asks you to co-make a loan, and when your loan requests are approved or declined',
  admin: 'when a member requests a loan, and when a request is ready to approve',
}

/** The Notifications section: Account tab (members) and Coop tab (admin). */
export function PushSetting({ who }: { who: 'member' | 'admin' }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { pushState().then(setState, () => setState('unsupported')) }, [])
  const turnOn = async () => {
    setBusy(true); setError(null)
    try { setState(await enablePush(true)) } catch (err) { setError((err as Error).message || "Couldn't turn notifications on. Try again.") } finally { setBusy(false) }
  }
  if (!state) return null
  return (
    <div className="section">
      <h2>Notifications</h2>
      {state === 'on' && <p className="note">On for this phone. You'll get one {WHAT[who]}.</p>}
      {state === 'off' && <>
        <p className="note">Get a notification on this phone {WHAT[who]}.</p>
        <button className="btn wide" disabled={busy} onClick={turnOn}>{busy ? 'Turning on…' : 'Turn on notifications'}</button>
      </>}
      {state === 'blocked' && <p className="note">Notifications are blocked for Hilas Coop on this phone. Allow them in your browser's site settings for hilas-coop.web.app, then come back here.</p>}
      {state === 'install-first' && <p className="note">On iPhone, add Hilas Coop to your Home Screen first: tap Share, then Add to Home Screen. Open it from there and turn notifications on here.</p>}
      {state === 'unsupported' && <p className="note">This browser can't show notifications. Use Chrome on Android, or the Home Screen app on iPhone.</p>}
      {error && <p className="alert" role="alert">{error}</p>}
    </div>
  )
}
