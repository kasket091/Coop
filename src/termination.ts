import type { Txn } from './ledger'

// Termination: 3 carryover months in a row, then a 4th month still not paid (flagged; the admin confirms).

const cents = (x: number) => Math.round(x * 100) / 100

/**
 * The first run of 3 carried-over months in a row whose next month has closed and was carried over or paid short.
 * `closed` = how many months of the cycle are past their 1st–7th window.
 */
export function terminationFlag(carry: Set<number>, paid: number[], due: number, closed: number) {
  for (let m = 0; m + 3 < 12; m++) {
    if (!(carry.has(m) && carry.has(m + 1) && carry.has(m + 2))) continue
    const fourth = m + 3
    if (fourth < closed && (carry.has(fourth) || (paid[fourth] ?? 0) < due)) return { months: [m, m + 1, m + 2], fourth }
  }
  return null
}

/** What a terminated member gets: savings less the 20% fee (handbook), less unpaid loans taken as automatic payment. */
export function terminationPayout(saved: number, unpaid: number) {
  const fee = cents(saved * 0.2)
  const afterFee = cents(saved - fee)
  const loansDeducted = cents(Math.min(unpaid, afterFee))
  return { saved, fee, afterFee, loansDeducted, payout: cents(afterFee - loansDeducted), stillOwed: cents(Math.max(0, unpaid - afterFee)) }
}

/**
 * At termination, what's left after the fee pays the unpaid loans: app loans oldest first, then the old-sheet
 * balance. A loan the money runs out on is part-paid; whatever is left over is the termination payout.
 */
export function payFromSavings(loans: { id: string; balance: number }[], sheetBalance: number, available: number) {
  let left = available
  const payments: { id: string; amount: number; full: boolean }[] = []
  for (const l of loans) {
    if (left <= 0) break
    const amount = cents(Math.min(l.balance, left))
    payments.push({ id: l.id, amount, full: amount >= l.balance })
    left = cents(left - amount)
  }
  const sheetPaid = cents(Math.min(sheetBalance, Math.max(0, left)))
  left = cents(left - sheetPaid)
  const owed = cents(loans.reduce((t, l) => t + l.balance, 0) + sheetBalance)
  return { payments, sheetPaid, payout: Math.max(0, left), stillOwed: cents(Math.max(0, owed - available)) }
}

/**
 * Accounts terminated before the fee counted Savings Loans paid off: the rest of the 20% still to book (in the
 * termination month), worked out from the live savings and the live "Termination fee" entries. Empty once booked.
 */
export function feeTopUps(members: { uid: string; terminated?: unknown; paid: number[] }[], txns: Txn[], cycle: number) {
  const out: { uid: string; add: number; month: number; saved: number; fee: number }[] = []
  for (const m of members) {
    if (!m.terminated) continue
    const fees = txns.filter((t) => t.memberId === m.uid && t.cycle === cycle && !t.voidedAt && t.kind === 'interest' && t.note.startsWith('Termination fee'))
    if (!fees.length) continue
    const saved = cents(m.paid.reduce((a, b) => a + b, 0))
    const fee = cents(saved * 0.2)
    const add = cents(fee - fees.reduce((t, f) => t + f.amount, 0))
    if (add > 0) out.push({ uid: m.uid, add, month: fees[0].month, saved, fee })
  }
  return out
}
