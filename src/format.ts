export function peso(n: number): string {
  const r = Math.round(Math.abs(n) * 100) / 100
  const body = r.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : ''}₱${body}`
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Nov 28" in Philippine time (loan due dates). */
export const dueDay = (ms: number) => new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
