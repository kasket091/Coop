export function peso(n: number): string {
  const r = Math.round(Math.abs(n) * 100) / 100
  const body = r.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}₱${body}`
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Nov 28" in Philippine time (loan due dates). */
export const dueDay = (ms: number) => new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })

/** The loan card's interest line (requests.ts interestNext). */
export function interestLine(n: { kind: string; on: number; amount?: number }) {
  if (n.kind === 'due') return `${peso(n.amount ?? 0)} interest due ${dueDay(n.on)}`
  if (n.kind === 'added') return `${peso(n.amount ?? 0)} more added ${dueDay(n.on)} unless paid in full`
  if (n.kind === 'next') return `next interest due ${dueDay(n.on)}`
  return `pay in full by ${dueDay(n.on)}`
}
