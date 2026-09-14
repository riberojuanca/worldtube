import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const metadata = (directory) => JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'))

function resolvePackage(name, from) {
  for (let directory = from; ; directory = path.dirname(directory)) {
    const candidate = path.join(directory, 'node_modules', name)
    if (existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate)
    if (directory === path.dirname(directory)) return null
  }
}

function noticeFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!prefix && !/^(licen[sc]e|notice|copying|copyright)/i.test(entry.name)) return []
    const relative = path.join(prefix, entry.name)
    if (entry.isDirectory()) return noticeFiles(path.join(directory, entry.name), relative)
    return entry.isFile() ? [relative] : []
  })
}

export async function prepareNotices(context) {
  if (context && context.electronPlatformName !== process.platform) {
    throw new Error('Prepare runtime notices on the target OS; cross-OS packaging is not reviewed.')
  }
  const output = path.join(root, 'build/third-party')
  const source = JSON.parse(await readFile(path.join(root, 'third-party/sources.json'), 'utf8'))
  if (source.unresolvedFonts.length || source.fonts.length !== 9) throw new Error('Resolve font provenance before packaging.')
  const fontDirectory = path.join(root, 'src/renderer/src/assets/fonts')
  const recordedFonts = new Set(source.fonts.map((entry) => path.basename(entry.file)))
  for (const file of readdirSync(fontDirectory)) {
    if (/\.(woff2?|ttf|otf)$/i.test(file) && !recordedFonts.has(file)) throw new Error(`Unreviewed font asset: ${file}`)
  }
  for (const entry of [...source.notices, ...source.fonts, ...source.icons]) {
    if (hash(await readFile(path.join(root, entry.file))) !== entry.sha256) throw new Error(`Reviewed asset changed: ${entry.file}`)
  }
  const packages = new Map()
  const seen = new Set()
  function visit(directory) {
    if (seen.has(directory)) return
    seen.add(directory)
    const pkg = metadata(directory)
    const id = `${pkg.name}@${pkg.version}`
    packages.set(id, { pkg, directory })
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      const dependency = resolvePackage(name, directory)
      if (dependency) visit(dependency)
      else if (!pkg.optionalDependencies?.[name]) throw new Error(`Required runtime package missing: ${id} -> ${name}`)
    }
  }
  const app = metadata(root)
  for (const name of [...Object.keys(app.dependencies), 'shaka-player']) {
    const directory = resolvePackage(name, root)
    if (!directory) throw new Error(`Runtime component missing: ${name}`)
    visit(directory)
  }
  const esbuild = [...packages.values()].find(({ pkg }) => pkg.name === 'esbuild')
  const mit = readFileSync(path.join(esbuild.directory, 'LICENSE.md'), 'utf8')
  const mitTerms = mit.slice(mit.indexOf('Permission is hereby granted'))
  if (!mitTerms.startsWith('Permission is hereby granted')) throw new Error('Missing complete MIT terms')
  const declaration = JSON.parse(await readFile(path.join(root, 'third-party/lazy-val-package.json'), 'utf8'))
  const inventory = []
  const texts = []
  for (const [id, { pkg, directory }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    if (!pkg.license) throw new Error(`License metadata missing: ${id}`)
    let notices = noticeFiles(directory).map((file) => ({ source: file.replaceAll('\\', '/'), text: readFileSync(path.join(directory, file), 'utf8') }))
    if (pkg.name === 'lazy-val') {
      if (pkg.version !== declaration.version || pkg.license !== 'MIT' || declaration.license !== 'MIT' || pkg.author !== declaration.author) throw new Error(`Review lazy-val notice for ${id}`)
      notices = [{ source: 'reviewed upstream package metadata and complete MIT terms',
        text: `Author: ${declaration.author}\nUpstream license declaration: MIT\nStandalone upstream license file is absent; no copyright year is reconstructed.\n\n${mitTerms}\n\n${JSON.stringify(declaration, null, 2)}` }]
    } else if (pkg.name.startsWith('@esbuild/') && !notices.length) {
      if (pkg.version !== esbuild.pkg.version || pkg.license !== 'MIT') throw new Error(`Review native esbuild notice for ${id}`)
      notices = [{ source: `esbuild@${pkg.version}/LICENSE.md`, text: mit }]
    } else if (pkg.name === '@bufbuild/protobuf') {
      if (pkg.version !== '2.15.0') throw new Error(`Review protobuf notice for ${id}`)
      const varint = readFileSync(path.join(directory, 'dist/esm/wire/varint.js'), 'utf8')
      const header = varint.split('\n').slice(0, varint.split('\n').findIndex((line) => !line.startsWith('//'))).map((line) => line.replace(/^\/\/ ?/, '')).join('\n')
      if (!header.includes('Copyright 2008 Google Inc.') || !header.includes('THIS SOFTWARE IS PROVIDED')) throw new Error('Missing protobuf BSD notice')
      notices.push({ source: 'pinned upstream LICENSE', text: await readFile(path.join(root, 'third-party/protobuf-2.15.0-LICENSE.txt'), 'utf8') },
        { source: 'installed dist/esm/wire/varint.js BSD header', text: header })
    }
    if (!notices.length || notices.some((notice) => !notice.text.trim())) throw new Error(`Required notice text missing: ${id}`)
    const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? null
    inventory.push({ name: pkg.name, version: pkg.version, license: pkg.license, repository,
      notices: notices.map(({ source, text }) => ({ source, sha256: hash(text) })) })
    texts.push(`===== ${id} | ${pkg.license} =====\n${notices.map(({ source, text }) => `--- ${source} ---\n${text}`).join('\n\n')}`)
  }
  const style = await readFile(path.join(root, 'src/renderer/src/player/styles/shaka-controls.css'), 'utf8')
  const tooltip = style.match(/\/\*!\s*\* @license[\s\S]*?Felipe Fialho[\s\S]*?\*\//)?.[0]
  if (!tooltip) throw new Error('Shaka tooltip attribution missing')
  const assets = []
  for (const entry of source.notices) assets.push(`===== ${entry.file} =====\nSource: ${entry.source}\n\n${await readFile(path.join(root, entry.file), 'utf8')}`)
  assets.push(`===== Customized Shaka tooltip notice =====\n${tooltip}`)
  const electron = resolvePackage('electron', root)
  if (!electron) throw new Error('Electron distribution missing')
  const electronVersion = metadata(electron).version
  const electronLicense = await readFile(path.join(electron, 'dist/LICENSE'))
  const chromiumLicense = await readFile(path.join(electron, 'dist/LICENSES.chromium.html'))
  if (!electronLicense.length || !chromiumLicense.length) throw new Error('Electron runtime notices missing')
  inventory.push({ name: 'electron', version: electronVersion, license: 'MIT and bundled component licenses',
    notices: [{ source: 'dist/LICENSE', sha256: hash(electronLicense) }, { source: 'dist/LICENSES.chromium.html', sha256: hash(chromiumLicense) }] })
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'DEPENDENCY_LICENSES.txt'), `${texts.join('\n\n')}\n`)
  await writeFile(path.join(output, 'ASSET_LICENSES.txt'), `${assets.join('\n\n')}\n`)
  await writeFile(path.join(output, 'Electron-LICENSE.txt'), electronLicense)
  await writeFile(path.join(output, 'LICENSES.chromium.html'), chromiumLicense)
  await copyFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(output, 'THIRD_PARTY_NOTICES.md'))
  await copyFile(path.join(root, 'third-party/sources.json'), path.join(output, 'sources.json'))
  const report = { platform: process.platform, architecture: process.arch, packages: inventory }
  await writeFile(path.join(output, 'inventory.json'), `${JSON.stringify(report, null, 2)}\n`)
  if (process.argv.includes('--snapshot')) await writeFile(path.join(root, 'third-party/dependencies.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Prepared notices for ${inventory.length} runtime/bundled components and ${source.fonts.length} official fonts; no application build.`)
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) await prepareNotices()
