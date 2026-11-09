import { expect, it } from 'vitest'
import { handbookLinkProblem } from './handbook'

it('the handbook link must be a full https link', () => {
  expect(handbookLinkProblem('https://drive.google.com/file/d/1AbC/view?usp=sharing')).toBeNull()
  expect(handbookLinkProblem('  https://drive.google.com/file/d/1AbC/view  ')).toBeNull()
  expect(handbookLinkProblem('drive.google.com/file/d/1AbC')).toMatch(/https/)
  expect(handbookLinkProblem('http://example.com/handbook.pdf')).toMatch(/https/)
  expect(handbookLinkProblem('javascript:alert(1)')).toMatch(/https/)
})
