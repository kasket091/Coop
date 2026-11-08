import { describe, expect, it } from 'vitest'
import type { Member } from './rules'
import { canAdminApprove, requestStage, validateRequest, type LoanRequest } from './requests'

const zeros = () => Array(12).fill(0)
const borrower: Member = { id: 1, name: 'Aljem Aviola', heads: 12, paid: zeros(), interest: zeros() }
const base = {
  borrower, comakerIds: ['f1', 'f2'], founderIds: ['f1', 'f2', 'f3'], type: 'flex' as const,
  amount: 5000, months: 1, today: new Date(2026, 10, 8), year: 2026, hasPending: false, borrowerId: 'me',
}

describe('validateRequest', () => {
  it('accepts a valid 1-month flex loan on 8 Nov 2026', () => expect(validateRequest(base)).toBeNull())
  it('needs exactly two co-makers', () => expect(validateRequest({ ...base, comakerIds: ['f1'] })).toMatch(/2 co-makers/))
  it('refuses the same co-maker twice', () => expect(validateRequest({ ...base, comakerIds: ['f1', 'f1'] })).toMatch(/different/))
  it('refuses a non-founder co-maker', () => expect(validateRequest({ ...base, comakerIds: ['f1', 'x'] })).toMatch(/founding/))
  it('refuses yourself as co-maker', () =>
    expect(validateRequest({ ...base, borrowerId: 'f1', founderIds: ['f1', 'f2'] })).toMatch(/yourself/))
  it('refuses more than the loan limit', () => expect(validateRequest({ ...base, amount: 96001 })).toMatch(/limit/))
  it('refuses a term longer than the months left', () => expect(validateRequest({ ...base, months: 2 })).toMatch(/December 15/))
  it('refuses a regular term that does not fit', () =>
    expect(validateRequest({ ...base, type: 'regular', amount: 20000, months: 2 })).toMatch(/December 15/))
  it('passes on handbook loan errors', () => expect(validateRequest({ ...base, type: 'grocery', amount: 1500 })).toMatch(/2,000/))
  it('refuses a second pending request', () => expect(validateRequest({ ...base, hasPending: true })).toMatch(/pending/))
})

const req = (a: string, b: string, status: LoanRequest['status'] = 'pending'): LoanRequest => ({
  id: 'r', borrowerId: 'me', borrowerName: 'Aljem Aviola', type: 'flex', amount: 5000, months: 1, quote: '',
  comakers: { f1: { name: 'A', status: a as never }, f2: { name: 'B', status: b as never } }, comakerIds: ['f1', 'f2'],
  status, createdAt: 0,
})

describe('approval flow', () => {
  it('admin can approve only when both co-makers approved', () => {
    expect(canAdminApprove(req('approved', 'pending'))).toBe(false)
    expect(canAdminApprove(req('approved', 'declined'))).toBe(false)
    expect(canAdminApprove(req('approved', 'approved'))).toBe(true)
    expect(canAdminApprove(req('approved', 'approved', 'approved'))).toBe(false)
  })
  it('names the stage', () => {
    expect(requestStage(req('approved', 'pending'))).toBe('Waiting for co-makers')
    expect(requestStage(req('approved', 'approved'))).toBe('Waiting for admin')
    expect(requestStage(req('approved', 'approved', 'approved'))).toBe('Approved')
    expect(requestStage(req('declined', 'pending', 'declined'))).toBe('Declined')
    expect(requestStage(req('pending', 'pending', 'withdrawn'))).toBe('Withdrawn')
  })
})
