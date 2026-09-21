import { build } from 'vite'

// Do not depend on POSIX environment assignments: npm runs this on Windows too.
process.env.DSH_BASE = '/api/ming-life/app/'
await build()
await import('./build-engines.mjs')
