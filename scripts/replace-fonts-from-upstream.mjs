import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'third-party/sources.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  return Buffer.from(await response.arrayBuffer())
}
const catalogUrl = 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap'
const catalog = await download(catalogUrl)
const subsets = new Map()
postcss.parse(catalog.toString('utf8')).walkAtRules('font-face', (rule) => {
  const subset = rule.prev()?.type === 'comment' ? rule.prev().text.trim() : null
  rule.walkDecls('src', (declaration) => {
    const match = declaration.value.match(/url\(([^)]+)\)/)
    if (!subset || !match) return
    const url = new URL(match[1].replace(/^['"]|['"]$/g, ''))
    if (url.protocol !== 'https:' || url.hostname !== 'fonts.gstatic.com' || !url.pathname.endsWith('.woff2')) throw new Error('Unexpected font catalog URL')
    subsets.set(subset, url.href)
  })
})
const sources = [
  ['inter-cyrillic-ext.woff2', subsets.get('cyrillic-ext')],
  ['inter-cyrillic.woff2', subsets.get('cyrillic')],
  ['inter-greek.woff2', subsets.get('greek')],
  ['inter-latin-ext.woff2', subsets.get('latin-ext')],
  ['inter-latin.woff2', subsets.get('latin')],
  ['inter-symbols.woff2', subsets.get('greek-ext')],
  ['inter-vietnamese.woff2', subsets.get('vietnamese')],
]
const tightLicense = manifest.notices.find((entry) => entry.file === 'third-party/InterTight-OFL.txt')
if (!tightLicense) throw new Error('Missing pinned Inter Tight source')
const tightBase = tightLicense.source.slice(0, tightLicense.source.lastIndexOf('/') + 1)
sources.push(['InterTight-VariableFont_wght.ttf', `${tightBase}InterTight%5Bwght%5D.ttf`],
  ['InterTight-Italic-VariableFont_wght.ttf', `${tightBase}InterTight-Italic%5Bwght%5D.ttf`])

const assets = []
for (const [name, url] of sources) {
  if (!url) throw new Error(`Missing official source for ${name}`)
  const bytes = await download(url)
  const magic = bytes.subarray(0, 4).toString('hex')
  if (!['774f4632', '00010000'].includes(magic)) throw new Error(`Invalid font payload: ${name}`)
  assets.push({ file: `src/renderer/src/assets/fonts/${name}`, source: url, sha256: hash(bytes), bytes })
}
// Download every asset before replacing any of the approved local font files.
for (const asset of assets) await writeFile(path.join(root, asset.file), asset.bytes)
manifest.fonts = assets.map(({ bytes, ...asset }) => ({ ...asset, verification: 'downloaded directly from official upstream; unmodified bytes' }))
manifest.unresolvedFonts = []
manifest.fontCatalog = { source: catalogUrl, userAgent, sha256: hash(catalog) }
await writeFile(path.join(root, 'third-party/Inter-upstream.css'), catalog)
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Installed ${assets.length} official local font files; families unchanged.`)
