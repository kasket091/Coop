// A member's account log, built from their transactions: savings and each loan from its capital, with every
// carryover and payment and what was owed after it, by month, newest first. Read-only: nothing here is typed in.
import type { Txn } from './ledger'
import { balanceOf, periodAt, type LoanRequest, type LoanType } from './requests'

export type LogLine = { at: number; label: string; amount?: number; balance?: number }
export type LogGroup = { title: string; lines: LogLine[] }
/** A month, with its entries grouped: savings, and each loan by its ID (3FL · Flex loan). */
export type LogSection = { title: string; groups: LogGroup[] }

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LOAN: Record<LoanType, string> = {
  regular: 'Regular loan', flex: 'Flex loan', grocery: 'Grocery loan', appliance: 'Appliance loan',
  events: 'Special Events loan', deposit: 'Loan Against Deposit', savings: 'Savings Loan',
}
// shortcut: carryover entries keep their amounts, and recalculated payments their balance, only in the note text
// ("₱3,840 interest …; balance now ₱51,840"); store them as fields on the entry if these notes are ever reworded
const peso = (s?: string) => (s ? Number(s.replace(/,/g, '')) : undefined)
const firstPeso = (note: string) => peso(note.match(/₱([\d,]+(?:\.\d+)?)/)?.[1])
const balanceNow = (note: string) => peso(note.match(/balance now ₱([\d,]+(?:\.\d+)?)/)?.[1])

function label(t: Txn): string {
  if (t.carryover) return 'Carry Over Interest'
  if (t.kind === 'interest') return 'Interest Payment'
  if (t.kind === 'principal') return 'Capital Payment'
  if (t.kind === 'savings' && t.settles && /savings paid/.test(t.note)) return 'Savings Payment'
  return t.note
}

function loanLines(r: LoanRequest, txns: Txn[]): LogLine[] {
  // in one action: by period, a period's payment before its carryover, a payment's interest part before its loan part
  const order = (t: Txn) => (t.kind === 'interest' ? 0 : t.kind === 'principal' ? 1 : 2)
  const live = txns.filter((t) => t.loanId === r.id && !t.voidedAt && !t.restores)
    .sort((a, b) => a.createdAt - b.createdAt || (a.period ?? 0) - (b.period ?? 0) || (a.paidOn ?? 0) - (b.paidOn ?? 0) || order(a) - order(b))
  // one admin action (or one daily run) writes its entries together; the next one's "before" is this one's "after"
  const groups: Txn[][] = []
  for (const t of live) {
    const g = groups[groups.length - 1]
    if (g && g[0].createdAt === t.createdAt) g.push(t); else groups.push([t])
  }
  // the approval (or the carried-over savings) opens the loan: the capital line says it
  if (groups[0]?.[0].loanBefore && groups[0][0].loanBefore.status !== 'approved') groups.shift()
  const end = r.status === 'paid' ? 0 : balanceOf(r)
  const after = (i: number) => groups[i + 1]?.[0].loanBefore?.balance ?? end
  const start = r.decidedAt ?? r.createdAt
  const capital: LogLine = {
    at: start,
    label: r.type === 'savings' && r.carriedMonth !== undefined ? `${MONTH[r.carriedMonth]} savings carried over${r.upfront ? ' (+10%)' : ''}` : 'Capital',
    // a monthly loan starts at what was borrowed; a Savings Loan at what the carry-over left owed
    amount: r.amount, balance: r.type === 'savings' ? groups[0]?.[0].loanBefore?.balance ?? end : r.amount,
  }
  const lines = [capital]
  groups.forEach((g, i) => {
    for (let j = 0; j < g.length; j++) {
      const t = g[j], next = g[j + 1]
      const at = t.carryover && t.period ? periodAt(r, t.period).dueAt : t.paidOn ?? t.createdAt
      // one payment's interest and loan parts are one line
      const both = t.kind === 'interest' && next?.kind === 'principal' && (next.paidOn ?? next.createdAt) === at && next.period === t.period
      const end = both ? next : t
      if (both) j++
      const amount = t.carryover ? firstPeso(t.note) : both ? Math.round((t.amount + next.amount) * 100) / 100 : t.amount > 0 ? t.amount : undefined
      const balance = balanceNow(end.note) ?? (j === g.length - 1 ? after(i) : undefined)
      lines.push({ at, label: both ? 'Interest and Loan Payment' : label(t), ...(amount !== undefined ? { amount } : {}), ...(balance !== undefined ? { balance } : {}) })
    }
  })
  return lines
}

const MONTH_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * By month, newest month first. Savings go under the month they are for (January's savings under January, even when
 * recorded later or ahead); everything else under the month it happened. Within a month, entries are grouped
 * (savings, and each loan by its ID), the group with the latest entry first, newest entry first within each group.
 */
export function accountLog(loans: LoanRequest[], txns: Txn[]): LogSection[] {
  const monthKey = (ms: number) => { const d = new Date(ms + 8 * 3600_000); return d.getUTCFullYear() * 12 + d.getUTCMonth() } // Manila
  const own = txns.filter((t) => !t.loanId && !t.voidedAt).map((t) => ({
    key: 'savings', group: 'Savings', month: t.kind === 'savings' ? t.cycle * 12 + t.month : monthKey(t.createdAt),
    line: { at: t.createdAt, label: t.kind === 'savings' ? `${MONTH[t.month]} savings` : t.note, ...(t.amount > 0 ? { amount: t.amount } : {}) } as LogLine,
  }))
  const loanLog = loans.filter((r) => r.status === 'approved' || r.status === 'paid')
    .flatMap((r) => loanLines(r, txns).map((line) => ({ key: r.id, group: [r.ref, LOAN[r.type]].filter(Boolean).join(' · '), month: monthKey(line.at), line })))
  // newest month first, then newest first; entries saved together keep their order reversed, so the one carrying
  // the balance stays on top
  const all = [...own, ...loanLog].map((e, i) => ({ ...e, i })).sort((a, b) => b.month - a.month || b.line.at - a.line.at || b.i - a.i)
  const sections: (LogSection & { month: number; keys: string[] })[] = []
  for (const e of all) {
    let month = sections[sections.length - 1]
    if (month?.month !== e.month) sections.push(month = { title: MONTH_NAME[e.month % 12], month: e.month, groups: [], keys: [] })
    const k = month.keys.indexOf(e.key)
    if (k >= 0) month.groups[k].lines.push(e.line)
    else { month.keys.push(e.key); month.groups.push({ title: e.group, lines: [e.line] }) }
  }
  return sections.map(({ title, groups }) => ({ title, groups }))
}
