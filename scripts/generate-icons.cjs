const { createRequire } = require('node:module')
const { copyFile, mkdir } = require('node:fs/promises')
const path = require('node:path')

const builderRequire = createRequire(require.resolve('electron-builder'))
const { runIconsTool } = builderRequire('app-builder-lib/out/toolsets/icons')

async function generate() {
  const inputFile = path.resolve('resources/icon.svg')
  const outDir = path.resolve('resources/icons')
  await mkdir(outDir, { recursive: true })
  await runIconsTool({ inputFile, outputFormat: 'set', outDir })
  await copyFile(path.join(outDir, '512x512.png'), path.resolve('resources/icon.png'))
  await runIconsTool({ inputFile, outputFormat: 'ico', outDir: path.resolve('resources') })
  await runIconsTool({ inputFile, outputFormat: 'icns', outDir: path.resolve('resources') })
}

generate().catch((error) => { console.error(error); process.exitCode = 1 })
