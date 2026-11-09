import { expect, it } from 'vitest'
import { handbookProblem } from './handbook'

const MB = 1024 * 1024
it('only a PDF, not empty, up to 25 MB, can be the handbook', () => {
  expect(handbookProblem({ name: 'Handbook 2026.pdf', type: 'application/pdf', size: 3 * MB })).toBeNull()
  expect(handbookProblem({ name: 'HANDBOOK.PDF', type: '', size: MB })).toBeNull() // some phones send no type
  expect(handbookProblem({ name: 'rules.docx', type: 'application/msword', size: MB })).toMatch(/PDF/)
  expect(handbookProblem({ name: 'big.pdf', type: 'application/pdf', size: 26 * MB })).toMatch(/25 MB/)
  expect(handbookProblem({ name: 'empty.pdf', type: 'application/pdf', size: 0 })).toMatch(/empty/)
})
