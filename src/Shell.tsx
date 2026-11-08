import type { ReactNode } from 'react'

export type TabDef<T extends string> = { id: T; label: string; Icon: () => JSX.Element; badge?: number }

/** The handbook band on top, one working area, the bottom tab bar (max 5 tabs). */
export function Shell<T extends string>({ year, tabs, current, onTab, children }: {
  year: number; tabs?: TabDef<T>[]; current?: T; onTab?: (t: T) => void; children: ReactNode
}) {
  return (
    <>
      <header className="band">
        <img src="logo.png" alt="" width="36" height="36" />
        <strong>HILAS COOP</strong>
        <span className="year" aria-label={String(year)}>{year}</span>
      </header>
      <main className={tabs ? undefined : 'no-tabs'}>{children}</main>
      {tabs && (
        <nav className="tabs" aria-label="Sections" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map(({ id, label, Icon, badge }) => (
            <button key={id} onClick={() => onTab?.(id)} aria-current={current === id ? 'page' : undefined}>
              <span className="tab-icon"><Icon />{badge ? <span className="badge" aria-label={`${badge} waiting`}>{badge}</span> : null}</span>
              {label}
            </button>
          ))}
        </nav>
      )}
    </>
  )
}

export const Loading = () => (
  <div aria-busy="true" aria-label="Loading">
    {[60, 90, 40, 75].map((w, i) => <div key={i} className="skeleton" style={{ width: `${w}%` }} />)}
  </div>
)
