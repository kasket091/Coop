// A member's account log, built from their transactions: savings and each loan from its capital, with every
// carryover and payment and what was owed after it, by month, newest first. Read-only: nothing here is typed in.
import type { Txn } from './ledger'
import { balanceOf, type LoanRequest, type LoanType } from './requests'

export type LogLine = { at: number; label: string; amount?: number; balance?: number }
export type LogSection = { title: string; lines: LogLine[] }

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
  const live = txns.filter((t) => t.loanId === r.id && !t.voidedAt).sort((a, b) => a.createdAt - b.createdAt)
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
    lines.push({ at: t.paidOn ?? t.createdAt, label: label(t), ...(amount !== undefined ? { amount } : {}), ...(balance !== undefined ? { balance } : {}) })
  }))
  return lines
}

const MONTH_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * One list by month, newest month first (and newest entry first within it): savings and every loan's entries
 * together, each loan line starting with its reference (3FL) or, without one, its type.
 */
export function accountLog(loans: LoanRequest[], txns: Txn[]): LogSection[] {
  const own = txns.filter((t) => !t.loanId && !t.voidedAt)
    .map((t): LogLine => ({ at: t.createdAt, label: t.kind === 'savings' ? `${MONTH[t.month]} savings` : t.note, ...(t.amount > 0 ? { amount: t.amount } : {}) }))
  const loanLog = loans.filter((r) => r.status === 'approved' || r.status === 'paid')
    .flatMap((r) => loanLines(r, txns).map((l) => ({ ...l, label: `${r.ref ?? LOAN[r.type]} ${l.label}` })))
  // newest first; entries saved together keep their order reversed, so the one carrying the balance stays on top
  const all = [...own, ...loanLog].map((l, i) => ({ l, i })).sort((a, b) => b.l.at - a.l.at || b.i - a.i).map((x) => x.l)
  const sections: LogSection[] = []
  for (const l of all) {
    const title = MONTH_NAME[new Date(l.at + 8 * 3600_000).getUTCMonth()] // Manila
    const last = sections[sections.length - 1]
    if (last?.title === title) last.lines.push(l); else sections.push({ title, lines: [l] })
  }
  return sections
}
