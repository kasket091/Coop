import { expect, it } from 'vitest'
import { newerBuild } from './pwa'

const page = (name: string) => `<script type="module" crossorigin src="./assets/${name}"></script>`

it('a newer deploy is spotted by its code file name', () => {
  expect(newerBuild('./assets/index-OLD1.js', page('index-NEW2.js'))).toBe(true)
  expect(newerBuild('./assets/index-SAME.js', page('index-SAME.js'))).toBe(false)
})

it('no running file (dev server) or an unreadable page is never an update', () => {
  expect(newerBuild(undefined, page('index-NEW2.js'))).toBe(false)
  expect(newerBuild('./assets/index-OLD1.js', '<html>offline</html>')).toBe(false)
})
