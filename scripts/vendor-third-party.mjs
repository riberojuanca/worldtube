import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'third-party')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const blobHash = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const headers = { 'User-Agent': 'WorldTube-third-party-source-review', Accept: 'application/vnd.github+json' }
async function download(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  return Buffer.from(await response.arrayBuffer())
}
async function json(url) { return JSON.parse((await download(url)).toString('utf8')) }
await mkdir(output, { recursive: true })
const revisions = new Map()
async function pinned(repo, ref, file) {
  const key = `${repo}:${ref}`
  if (!revisions.has(key)) revisions.set(key, (await json(`https://api.github.com/repos/${repo}/commits/${ref}`)).sha)
  return `https://raw.githubusercontent.com/${repo}/${revisions.get(key)}/${file}`
}
const notices = [
  ['Inter-OFL.txt', 'google/fonts', 'main', 'ofl/inter/OFL.txt'],
  ['InterTight-OFL.txt', 'google/fonts', 'main', 'ofl/intertight/OFL.txt'],
  ['Lucide-LICENSE.txt', 'lucide-icons/lucide', 'main', 'LICENSE'],
  ['Pictogrammers-LICENSE.txt', 'Templarian/MaterialDesign', 'master', 'LICENSE'],
  ['Apache-2.0.txt', 'apache/.github', 'main', 'LICENSE'],
  ['lazy-val-package.json', 'develar/lazy-val', 'master', 'package.json'],
  ['protobuf-2.15.0-LICENSE.txt', 'bufbuild/protobuf-es', 'v2.15.0', 'LICENSE'],
  ['Go-LICENSE.txt', 'golang/go', 'go1.20.12', 'LICENSE'],
]
const record = { notices: [], fonts: [], icons: [], unresolvedFonts: [] }
const adjacentNotices = {
  'Inter-OFL.txt': 'src/renderer/src/assets/fonts/OFL-Inter.txt',
  'InterTight-OFL.txt': 'src/renderer/src/assets/fonts/OFL-InterTight.txt',
  'Lucide-LICENSE.txt': 'src/renderer/src/assets/icons/LICENSE-LUCIDE.txt',
  'Apache-2.0.txt': 'src/renderer/src/assets/icons/LICENSE-APACHE-2.0.txt',
}
for (const [name, repo, ref, file] of notices) {
  const url = await pinned(repo, ref, file)
  const bytes = await download(url)
  await writeFile(path.join(output, name), bytes)
  if (adjacentNotices[name]) await writeFile(path.join(root, adjacentNotices[name]), bytes)
  record.notices.push({ file: `third-party/${name}`, source: url, sha256: hash(bytes) })
}

try {
  const previous = JSON.parse(await readFile(path.join(output, 'sources.json'), 'utf8'))
  if (previous.fontCatalog) record.fontCatalog = previous.fontCatalog
} catch { /* First-time collection has no catalog receipt yet. */ }

const fontDir = path.join(root, 'src/renderer/src/assets/fonts')
const interFiles = ['inter-cyrillic-ext.woff2', 'inter-cyrillic.woff2', 'inter-greek.woff2',
  'inter-latin-ext.woff2', 'inter-latin.woff2', 'inter-symbols.woff2', 'inter-vietnamese.woff2']
const endings = ['a2JL7SUc', 'a0ZL7SUc', 'a2ZL7SUc', 'a1pL7SUc', 'a2pL7SUc', 'a25L7SUc', 'a1ZL7']
const unmatched = new Map()
for (const name of interFiles) unmatched.set(name, hash(await readFile(path.join(fontDir, name))))
for (const version of [20, 19, 18]) {
  if (!unmatched.size) break
  for (const ending of endings) {
    const url = `https://fonts.gstatic.com/s/inter/v${version}/UcC73FwrK3iLTeHuS_nVMrMxCp50SjI${ending}.woff2`
    let bytes
    try { bytes = await download(url) } catch { continue }
    const digest = hash(bytes)
    for (const [name, localHash] of unmatched) {
      if (digest !== localHash) continue
      record.fonts.push({ file: `src/renderer/src/assets/fonts/${name}`, source: url, sha256: digest, verification: 'byte-identical' })
      unmatched.delete(name)
    }
  }
}
record.unresolvedFonts.push(...unmatched.keys())

for (const [name, upstream] of [
  ['InterTight-VariableFont_wght.ttf', 'InterTight[wght].ttf'],
  ['InterTight-Italic-VariableFont_wght.ttf', 'InterTight-Italic[wght].ttf']
]) {
  const local = await readFile(path.join(fontDir, name))
  const commits = await json(`https://api.github.com/repos/google/fonts/commits?path=${encodeURIComponent(`ofl/intertight/${upstream}`)}&per_page=100`)
  let matched = false
  for (const commit of commits) {
    const url = `https://raw.githubusercontent.com/google/fonts/${commit.sha}/ofl/intertight/${encodeURIComponent(upstream)}`
    let bytes
    try { bytes = await download(url) } catch { continue }
    if (blobHash(bytes) !== blobHash(local)) continue
    record.fonts.push({ file: `src/renderer/src/assets/fonts/${name}`, source: url, sha256: hash(local), verification: 'byte-identical' })
    matched = true
    break
  }
  if (!matched) record.unresolvedFonts.push(name)
}

for (const [name, repo, ref, file] of [
  ['earth.svg', 'lucide-icons/lucide', 'main', 'icons/earth.svg'],
  ['globe.svg', 'lucide-icons/lucide', 'main', 'icons/globe.svg'],
  ['world-solid.svg', 'Templarian/MaterialDesign', 'master', 'svg/earth.svg']
]) {
  const url = await pinned(repo, ref, file)
  const upstream = await download(url)
  const local = await readFile(path.join(root, 'src/renderer/src/assets/icons', name))
  const paths = (bytes) => [...bytes.toString('utf8').matchAll(/\bd="([^"]+)"/g)].map((match) => match[1])
  if (JSON.stringify(paths(local)) !== JSON.stringify(paths(upstream))) throw new Error(`Icon geometry differs: ${name}`)
  record.icons.push({ file: `src/renderer/src/assets/icons/${name}`, source: url, sha256: hash(local), verification: 'matching upstream path geometry; wrapper customized' })
}
await writeFile(path.join(output, 'sources.json'), `${JSON.stringify(record, null, 2)}\n`)
console.log(JSON.stringify({ notices: record.notices.length, fontsVerified: record.fonts.length,
  iconsVerified: record.icons.length, unresolvedFonts: record.unresolvedFonts }, null, 2))
