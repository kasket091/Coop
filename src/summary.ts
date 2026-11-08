import { normalizeName } from './accounts'
import { coopSummary, type Member } from './rules'

/** What every member may read: totals only, nothing that identifies a member. */
export type Summary = {
  totalHeads: number; totalSavings: number; totalInterest: number; dividendPerHead: number
  rebate: number; members: number; updatedAt: number
}

/**
 * Totals for `coop/summary`, plus each member's own top-borrower rebate. The rebate is written onto the
 * member's own doc (0 for everyone else), so only the top borrower can tell it is them.
 */
export function publicSummary(members: (Member & { uid: string })[]): { summary: Summary; rebates: Record<string, number> } {
  const c = coopSummary(members)
  const topUid = c.top ? members.find((m) => m.name === c.top!.name)?.uid : undefined
  const rebate = Math.round((c.top?.rebate ?? 0) * 100) / 100
  return {
    summary: {
      totalHeads: c.totalHeads, totalSavings: c.totalSavings, totalInterest: c.totalInterest, dividendPerHead: c.dividendPerHead,
      rebate, members: members.filter((m) => m.heads > 0 && !m.terminated).length, updatedAt: Date.now(),
    },
    rebates: Object.fromEntries(members.map((m) => [m.uid, m.uid === topUid ? rebate : 0])),
  }
}

/** Sheet rows not yet in Firebase, matched by name, so a failed import can simply be run again. */
export const importRows = <T extends { name: string }>(sheet: T[], existingNames: string[]) => {
  const have = new Set(existingNames.map(normalizeName))
  return sheet.filter((r) => !have.has(normalizeName(r.name)))
}
