import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// public/sw.js is a plain service-worker script: load it with a fake `self` and pull out its pure helpers.
const code = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const { route, assetsIn } = new Function('self', `${code}; return { route, assetsIn }`)({ addEventListener() {} }) as {
  route: (url: URL, origin: string, mode: string) => 'page' | 'static' | 'skip'
  assetsIn: (html: string) => string[]
}
const site = 'https://hilas-coop.web.app'
const r = (path: string, mode = 'cors', origin = site) => route(new URL(path, site), origin, mode)

it('the app page is network-first', () => {
  expect(r('/', 'navigate')).toBe('page')
  expect(r('/?tab=loans', 'navigate')).toBe('page')
})

it('built code files and icons are cache-first', () => {
  expect(r('/assets/index-CVqVgo6u.js')).toBe('static')
  expect(r('/assets/index-Ab12.css')).toBe('static')
  expect(r('/icon-192.png')).toBe('static')
})

it('Firebase, Google and anything off the site are never touched (balances stay live)', () => {
  expect(route(new URL('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen'), site, 'cors')).toBe('skip')
  expect(route(new URL('https://identitytoolkit.googleapis.com/v1/accounts:signIn'), site, 'cors')).toBe('skip')
  expect(r('/manifest.webmanifest')).toBe('skip') // no-cache on the server: always fresh
  expect(r('/sw.js')).toBe('skip')
})

it('finds the code files the app page loads', () => {
  const html = '<script type="module" crossorigin src="./assets/index-CVqVgo6u.js"></script><link rel="stylesheet" href="./assets/index-Xy.css">'
  expect(assetsIn(html)).toEqual(['./assets/index-CVqVgo6u.js', './assets/index-Xy.css'])
})
