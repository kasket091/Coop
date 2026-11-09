import { useEffect, useState, useSyncExternalStore } from 'react'

/** True when the live app page names a different code file than the one running: a newer deploy is out. */
export function newerBuild(runningSrc: string | null | undefined, liveHtml: string) {
  const live = liveHtml.match(/assets\/index-[\w-]+\.js/)?.[0]
  return !!(runningSrc && live && !runningSrc.endsWith(live))
}

/** The live site only: saves the app for offline launch (the dev server stays out of it). */
export function registerServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
}

const subscribe = (cb: () => void) => {
  addEventListener('online', cb); addEventListener('offline', cb)
  return () => { removeEventListener('online', cb); removeEventListener('offline', cb) }
}
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine)

/** "You're offline" and "New version" bars, shown above every screen. */
export function StatusBars() {
  const online = useOnline()
  const [update, setUpdate] = useState(false)
  useEffect(() => {
    if (!import.meta.env.PROD) return
    const running = document.querySelector('script[src*="assets/index-"]')?.getAttribute('src')
    const check = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return
      fetch('./', { cache: 'no-store' }).then((r) => r.text()).then((html) => { if (newerBuild(running, html)) setUpdate(true) }).catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    const id = setInterval(check, 10 * 60 * 1000)
    return () => { document.removeEventListener('visibilitychange', check); clearInterval(id) }
  }, [])
  return <>
    {!online && <p className="status-bar offline" role="status">You're offline. Saving is paused until you reconnect.</p>}
    {update && online && <p className="status-bar update" role="status">A new version of Hilas Coop is out. <button className="link inline" onClick={() => location.reload()}>Refresh</button></p>}
  </>
}
