const repository = 'riberojuanca/worldtube'
const status = document.getElementById('release-status')
const buttons = [...document.querySelectorAll('[data-platform]')]
const command = document.getElementById('install-command')
const copyButton = document.getElementById('copy-command')
const copyStatus = document.getElementById('copy-status')

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(command.textContent)
    copyStatus.textContent = 'Copied'
  } catch {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(command)
    selection?.removeAllRanges()
    selection?.addRange(range)
    copyStatus.textContent = 'Copy unavailable. Select and copy the commands above.'
  }
})

const linuxMenu = document.querySelector('.linux-downloads')
document.addEventListener('pointerdown', (event) => {
  if (!linuxMenu.contains(event.target)) linuxMenu.open = false
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && linuxMenu.open) {
    linuxMenu.open = false
    linuxMenu.querySelector('summary').focus()
  }
})

function assetFor(assets, platform) {
  const available = assets.filter((asset) => asset.state === 'uploaded' && asset.size > 0)
  if (platform === 'windows') return available.find((asset) => /\.exe$/i.test(asset.name) && !/arm64|ia32/i.test(asset.name))
  if (platform === 'linux') return available.find((asset) => /\.deb$/i.test(asset.name) && /amd64|x64/i.test(asset.name))
  if (platform === 'linux-appimage') return available.find((asset) => /\.AppImage$/i.test(asset.name) && !/arm64|aarch64|ia32/i.test(asset.name))
  const matches = available.filter((asset) => /\.dmg$/i.test(asset.name))
  return matches.find((asset) => /universal/i.test(asset.name))
    || matches.find((asset) => /x64/i.test(asset.name))
    || matches[0]
}

async function loadDownloads() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal, credentials: 'omit'
    })
    if (response.status === 404) {
      status.textContent = 'No release published yet.'
      return
    }
    if (!response.ok) throw new Error('Release lookup failed')
    const release = await response.json()
    if (release.draft || release.prerelease || !Array.isArray(release.assets)) throw new Error('No stable release')
    let count = 0
    for (const button of buttons) {
      const asset = assetFor(release.assets, button.dataset.platform)
      if (!asset) continue
      const url = new URL(asset.browser_download_url)
      if (url.origin !== 'https://github.com' || !url.pathname.startsWith(`/${repository}/releases/download/`)) continue
      button.href = url.href
      button.removeAttribute('aria-disabled')
      button.title = asset.name
      if (button.dataset.platform === 'linux') {
        command.textContent = `mkdir -p "$HOME/Downloads" &&\ncd "$HOME/Downloads" &&\nwget -O WorldTube.deb '${url.href.replaceAll("'", "%27")}' &&\nsudo apt install ./WorldTube.deb`
        copyButton.disabled = false
      }
      if (button.dataset.platform === 'mac' && /arm64/i.test(asset.name)) {
        button.lastChild.textContent = ' macOS (Apple Silicon)'
      }
      count++
    }
    status.textContent = count ? release.tag_name : 'No installers available yet.'
  } catch {
    status.textContent = ''
    const link = document.createElement('a')
    link.className = 'fallback'
    link.href = `https://github.com/${repository}/releases`
    link.textContent = 'View downloads on GitHub'
    status.append(link)
  } finally {
    clearTimeout(timeout)
    for (const button of buttons) {
      if (!button.hasAttribute('href')) button.title = 'Installer not available yet'
    }
    if (copyButton.disabled) command.textContent = 'DEB unavailable. Check GitHub Releases.'
  }
}

void loadDownloads()
