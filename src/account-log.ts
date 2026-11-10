// A member's account log, built from their transactions: savings, then each loan from its capital, with every
// carryover and payment and what was owed after it. Read-only: nothing here is typed in.
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

/** Savings (and other account entries) first, then each loan, oldest first. */
export function accountLog(loans: LoanRequest[], txns: Txn[]): LogSection[] {
  const own = txns.filter((t) => !t.loanId && !t.voidedAt).sort((a, b) => a.createdAt - b.createdAt)
  const savings: LogSection[] = own.length ? [{
    title: 'Savings',
    lines: own.map((t) => ({ at: t.createdAt, label: t.kind === 'savings' ? `${MONTH[t.month]} savings` : t.note, ...(t.amount > 0 ? { amount: t.amount } : {}) })),
  }] : []
  const shown = loans.filter((r) => r.status === 'approved' || r.status === 'paid')
    .sort((a, b) => (a.decidedAt ?? a.createdAt) - (b.decidedAt ?? b.createdAt))
  return [...savings, ...shown.map((r) => ({ title: [r.ref, LOAN[r.type]].filter(Boolean).join(' · '), lines: loanLines(r, txns) }))]
}
