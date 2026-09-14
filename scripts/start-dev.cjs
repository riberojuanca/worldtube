const { spawn } = require('node:child_process')
const { openSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const log = openSync(path.join(tmpdir(), 'worldtube-dev.log'), 'a')
const child = spawn(process.execPath, [path.join(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev', '--noSandbox'], {
  cwd: root,
  detached: true,
  stdio: ['ignore', log, log],
  env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}` }
})
child.on('error', (error) => { console.error(error); process.exitCode = 1 })
child.unref()
