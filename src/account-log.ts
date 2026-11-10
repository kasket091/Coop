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
// shortcut: carryover entries keep their amounts only in the note text ("₱3,840 interest …; balance now ₱51,840");
// store them as fields on the entry if these notes are ever reworded
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
  const live = txns.filter((t) => t.loanId === r.id && !t.voidedAt).sort((a, b) => a.createdAt - b.createdAt || (a.period ?? 0) - (b.period ?? 0))
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
    amount: r.amount, balance: groups[0]?.[0].loanBefore?.balance ?? end,
  }
  const lines = [capital]
  groups.forEach((g, i) => g.forEach((t, j) => {
    const last = j === g.length - 1
    const amount = t.carryover ? firstPeso(t.note) : t.amount > 0 ? t.amount : undefined
    const balance = (t.carryover ? balanceNow(t.note) : undefined) ?? (last ? after(i) : undefined)
    // a carryover belongs to the due date it was for, even when added later (a backdated loan gets several at once)
    const at = t.carryover && t.period ? periodAt(r, t.period).dueAt : t.paidOn ?? t.createdAt
    lines.push({ at, label: label(t), ...(amount !== undefined ? { amount } : {}), ...(balance !== undefined ? { balance } : {}) })
  }))
  return lines
}

const MONTH_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * By month, newest month first. Within a month, entries are grouped (savings, then each loan by its ID), the group
 * with the latest entry first, and newest entry first within each group.
 */
export function accountLog(loans: LoanRequest[], txns: Txn[]): LogSection[] {
  const own = txns.filter((t) => !t.loanId && !t.voidedAt)
    .map((t) => ({ key: 'savings', group: 'Savings', line: { at: t.createdAt, label: t.kind === 'savings' ? `${MONTH[t.month]} savings` : t.note, ...(t.amount > 0 ? { amount: t.amount } : {}) } as LogLine }))
  const loanLog = loans.filter((r) => r.status === 'approved' || r.status === 'paid')
    .flatMap((r) => loanLines(r, txns).map((line) => ({ key: r.id, group: [r.ref, LOAN[r.type]].filter(Boolean).join(' · '), line })))
  // newest first; entries saved together keep their order reversed, so the one carrying the balance stays on top
  const all = [...own, ...loanLog].map((e, i) => ({ ...e, i })).sort((a, b) => b.line.at - a.line.at || b.i - a.i)
  const sections: (LogSection & { keys: string[] })[] = []
  for (const e of all) {
    const title = MONTH_NAME[new Date(e.line.at + 8 * 3600_000).getUTCMonth()] // Manila
    let month = sections[sections.length - 1]
    if (month?.title !== title) sections.push(month = { title, groups: [], keys: [] })
    const k = month.keys.indexOf(e.key)
    if (k >= 0) month.groups[k].lines.push(e.line)
    else { month.keys.push(e.key); month.groups.push({ title: e.group, lines: [e.line] }) }
  }
  return sections.map(({ title, groups }) => ({ title, groups }))
}
