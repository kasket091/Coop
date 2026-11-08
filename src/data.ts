import type { Member } from './rules'

const SHEET_ID = '19qKH_WibPzvbi2BJ4kK6CgY7D5tke7A88Y0D4BGClbE'
const csvUrl = (sheet: string, range: string) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}&range=${range}`

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
  const interestRows = parseCsv(interestCsv).slice(1).filter((r) => r[1]?.trim())
  const interest = new Map(interestRows.map((r) => [key(r[1]), twelve(r, 2)]))
  const members: Member[] = parseCsv(savingsCsv).slice(1)
    .filter((r) => r[1]?.trim())
    .map((r) => ({
      id: toNumber(r[0]),
      name: clean(r[1]),
      heads: toNumber(r[2]),
      paid: twelve(r, 5),
      interest: interest.get(key(r[1])) ?? Array(12).fill(0),
    }))
  const known = new Set(members.map((m) => key(m.name)))
  for (const r of interestRows) {
    if (!known.has(key(r[1]))) members.push({ id: toNumber(r[0]), name: clean(r[1]), heads: 0, paid: Array(12).fill(0), interest: twelve(r, 2) })
  }
  return members
}

async function getText(fetchFn: typeof fetch, url: string) {
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Sheet request failed (${res.status})`)
  return res.text()
}

export async function loadMembers(fetchFn: typeof fetch = fetch.bind(globalThis)): Promise<Member[]> {
  const [savings, interest] = await Promise.all([
    getText(fetchFn, csvUrl('Members Monthly Savings', 'A1:R35')),
    getText(fetchFn, csvUrl('InterestPaid', 'A1:N35')),
  ])
  return parseMembers(savings, interest)
}
