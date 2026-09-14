import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'build/site')
await mkdir(output, { recursive: true })
for (const file of ['index.html', 'style.css', 'downloads.js']) {
  await copyFile(path.join(root, 'site', file), path.join(output, file))
}
// Reuse the canonical logo geometry; crop only its square app-icon canvas.
const icon = await readFile(path.join(root, 'resources/icon.svg'), 'utf8')
if (!icon.includes('viewBox="0 0 72 72"')) throw new Error('Review the logo canvas before preparing the site')
await writeFile(path.join(output, 'logo.svg'), icon.replace('viewBox="0 0 72 72"', 'viewBox="3 24 66 22"').replace('width="1024" height="1024"', 'width="660" height="220"'))
const attribution = 'WorldTube logo: derived from Pictogrammers earth artwork, Apache-2.0.\n\n'
const notice = await readFile(path.join(root, 'src/renderer/src/assets/icons/LICENSE-PICTOGRAMMERS.txt'), 'utf8')
const license = await readFile(path.join(root, 'src/renderer/src/assets/icons/LICENSE-APACHE-2.0.txt'), 'utf8')
await writeFile(path.join(output, 'notices.txt'), attribution + notice + '\n\n' + license)
console.log('Prepared static download page in build/site; no application build.')
