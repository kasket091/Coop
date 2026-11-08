import type { Member } from './rules'

const SHEET_ID = '19qKH_WibPzvbi2BJ4kK6CgY7D5tke7A88Y0D4BGClbE'
// Rows to 80 leave room for new members; headers=1 stops gviz guessing the header count.
const csvUrl = (sheet: string, range: string) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(sheet)}&range=${range}`
const TIMEOUT_MS = 15000

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

export function toNumber(s: string | undefined): number {
  const n = Number((s ?? '').replace(/[₱,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')
const twelve = (cells: string[], from: number) => Array.from({ length: 12 }, (_, i) => toNumber(cells[from + i]))

const clean = (name: string) => name.trim().replace(/\s+/g, ' ')

/**
 * Savings: B name, C heads, F..Q Jan–Dec. InterestPaid: B name, C..N Jan–Dec. Row 1 is headers in both.
 * People only on InterestPaid (e.g. a member who left) come back with 0 heads: their interest still funds the dividend.
 */
export function parseMembers(savingsCsv: string, interestCsv: string): Member[] {
  // gviz answers a renamed or missing tab with the first tab's content (HTTP 200), so check the layout.
  const [savingsHead, ...savingsBody] = parseCsv(savingsCsv)
  const [interestHead, ...interestBody] = parseCsv(interestCsv)
  if (savingsHead?.[1]?.trim() !== 'Share Holders' || savingsHead?.[2]?.trim() !== '# Heads') throw new Error('Unexpected sheet layout: Members Monthly Savings')
  if (interestHead?.[2]?.trim() !== 'Jan') throw new Error('Unexpected sheet layout: InterestPaid')
  const isMemberRow = (r: string[]) => toNumber(r[0]) > 0 && !!r[1]?.trim() // totals and labels below the table have no ID
  const interestRows = interestBody.filter(isMemberRow)
  const interest = new Map(interestRows.map((r) => [key(r[1]), twelve(r, 2)]))
  const members: Member[] = savingsBody
    .filter(isMemberRow)
    .map((r) => ({
      id: toNumber(r[0]),
      name: clean(r[1]),
      heads: toNumber(r[2]),
      paid: twelve(r, 5),
      interest: interest.get(key(r[1])) ?? Array(12).fill(0),
    }))
  if (!members.some((m) => m.heads > 0)) throw new Error('Unexpected sheet layout: no members with heads')
  const known = new Set(members.map((m) => key(m.name)))
  for (const r of interestRows) {
    if (!known.has(key(r[1]))) members.push({ id: toNumber(r[0]), name: clean(r[1]), heads: 0, paid: Array(12).fill(0), interest: twelve(r, 2) })
  }
  return members
}

async function getText(fetchFn: typeof fetch, url: string) {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Sheet request failed (${res.status})`)
  return res.text()
}

export async function loadMembers(fetchFn: typeof fetch = fetch.bind(globalThis)): Promise<Member[]> {
  const [savings, interest] = await Promise.all([
    getText(fetchFn, csvUrl('Members Monthly Savings', 'A1:R80')),
    getText(fetchFn, csvUrl('InterestPaid', 'A1:N80')),
  ])
  return parseMembers(savings, interest)
}
