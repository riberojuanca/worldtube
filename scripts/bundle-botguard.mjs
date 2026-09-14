import { build } from 'esbuild'

await build({
  entryPoints: ['src/main/botguard/script.ts'],
  outfile: 'build/botguard.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120'
})
