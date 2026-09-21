import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tracked = execFileSync('git', ['ls-files', '--', 'dist', 'dsh/engines.mjs'], { encoding: 'utf8' }).trim()
assert.equal(tracked, '', 'Generated output must not be tracked by Git')
const directory = await mkdtemp(path.join(tmpdir(), 'ming-life-pack-'))
try {
  // Exercise actual npm lifecycle hooks and inspect the tarball, not the source tree.
  execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--json', '--pack-destination', directory], { encoding: 'utf8' })
  const packs = (await readdir(directory)).filter(name => name.endsWith('.tgz'))
  assert.equal(packs.length, 1)
  execFileSync('tar', ['-xzf', path.join(directory, packs[0]), '-C', directory])
  const root = path.join(directory, 'package')
  for (const file of ['package.json', 'dsh/index.js', 'dsh/engines.mjs', 'lib/client.js', 'cordis.patch.yml', 'dist/index.html']) {
    assert.ok((await stat(path.join(root, file))).isFile(), `Missing packaged file: ${file}`)
  }
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8')
  const assets = [...html.matchAll(/(?:src|href)="\/api\/ming-life\/app\/([^"?#]+\.(?:js|css))"/g)]
  assert.ok(assets.some(([, file]) => file.endsWith('.js')), 'Missing built JS asset reference')
  assert.ok(assets.some(([, file]) => file.endsWith('.css')), 'Missing built CSS asset reference')
  for (const [, file] of assets) assert.ok((await stat(path.join(root, 'dist', file))).isFile(), `Missing referenced asset: ${file}`)
  execFileSync(process.execPath, ['--check', path.join(root, 'dsh/engines.mjs')])
  console.log('Packed frontend, engine, plugin entry and assets verified')
} finally {
  await rm(directory, { recursive: true, force: true })
}
