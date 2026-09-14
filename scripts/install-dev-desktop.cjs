const { access, mkdir, readFile, writeFile } = require('node:fs/promises')
const { homedir } = require('node:os')
const path = require('node:path')

// Desktop Entry Exec has its own quoting rules, separate from shell quoting.
function execArgument(value) {
  return `"${value.replace(/[%]/g, '%%').replace(/[\\"`$]/g, '\\$&')}"`
}
function desktopValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
}

async function install() {
  if (process.platform !== 'linux') throw new Error('This development launcher is Linux-only.')
  const root = path.resolve(__dirname, '..')
  const icon = path.join(root, 'resources/icon.png')
  await access(icon)
  const directory = path.join(process.env.XDG_DATA_HOME || path.join(homedir(), '.local/share'), 'applications')
  const target = path.join(directory, 'com.riberojuanca.worldtube.dev.desktop')
  const existing = await readFile(target, 'utf8').catch((error) => {
    if (error.code !== 'ENOENT') throw error
    return null
  })
  if (existing && !existing.includes('X-WorldTube-Development=true')) throw new Error(`Refusing to overwrite an existing launcher: ${target}`)
  const entry = [
    '[Desktop Entry]', 'Version=1.0', 'Type=Application', 'Name=WorldTube (Development)',
    'Comment=Local-first YouTube desktop client',
    `Exec=${desktopValue(`${execArgument(process.execPath)} ${execArgument(path.join(root, 'scripts/start-dev.cjs'))}`)}`,
    `Path=${desktopValue(root)}`, `Icon=${desktopValue(icon)}`,
    'Terminal=false', 'StartupNotify=false', 'StartupWMClass=com.riberojuanca.worldtube.dev',
    'Categories=AudioVideo;Video;', 'X-WorldTube-Development=true', ''
  ].join('\n')
  await mkdir(directory, { recursive: true })
  await writeFile(target, entry, { mode: 0o644 })
  console.log(`Registered ${target}`)
}

install().catch((error) => { console.error(error); process.exitCode = 1 })
