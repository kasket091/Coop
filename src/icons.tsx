// One stroke family (24px grid, 2px round strokes) for the whole app.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const IconSavings = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...S}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14.5h2" /></svg>
)
export const IconCoop = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...S}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15.5 14c2.8 0 5.5 1.6 5.5 5" /></svg>
)
export const IconLoans = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...S}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4" /></svg>
)
export const IconPay = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...S}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>
)
export const IconBell = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...S}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
)
export const IconUser = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...S}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></svg>
)
export const IconChart = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...S}><path d="M4 20h16" /><path d="M7 16v-5M12 16V7M17 16v-8" /></svg>
)
export const IconCheck = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...S} strokeWidth={3}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
)
export const IconClock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...S}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const IconAlert = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...S} strokeWidth={2.5}><path d="M12 7v6M12 17h0" /></svg>
)
