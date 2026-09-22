import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
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
  for (const file of ['package.json', 'dsh/index.js', 'dsh/engines.mjs', 'lib/client.js', 'cordis.patch.yml', 'workbench.json', 'dist/index.html']) {
    assert.ok((await stat(path.join(root, file))).isFile(), `Missing packaged file: ${file}`)
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'ming-life')
  const workbench = JSON.parse(await readFile(path.join(root, 'workbench.json'), 'utf8'))
  assert.equal(workbench.id, 'ming-life')
  assert.equal(workbench.version, manifest.version)
  assert.equal(manifest.repository?.url, 'git+https://github.com/dataelement/dsh-ming-life.git')
  assert.equal(manifest.exports?.['./client'], './lib/client.js')
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.ok(manifest.dsh?.client?.inject?.includes('dsh-desktop-workbenches'), 'Package must inject the Desktop workbench service')

  // Exercise the same pnpm tarball boundary used by DSH Desktop generations.
  const install = path.join(directory, 'install')
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'market-smoke', private: true, version: '0.0.0' }))
  await writeFile(path.join(directory, '.npmrc'), 'node-linker=hoisted\nauto-install-peers=false\n')
  execFileSync(process.execPath, [
    path.resolve('node_modules/pnpm/bin/pnpm.cjs'),
    'add',
    `file:${path.join(directory, packs[0])}`,
    '--dir', directory,
    '--config.auto-install-peers=false',
    '--config.node-linker=hoisted'
  ], { stdio: 'pipe' })
  const installed = JSON.parse(await readFile(path.join(directory, 'node_modules', manifest.name, 'package.json'), 'utf8'))
  assert.equal(installed.name, manifest.name)
  assert.equal(installed.version, manifest.version)

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
