import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { t, useLocale } from '../i18n/LocaleContext'
import type { UpdateState } from '../../../shared/ipc'

export function ApplicationSettings() {
  const { language, checkForUpdatesOnStartup, savePreferences, error } = useLocale()
  return <section className="grid gap-3">
    <h2 className="border-b border-neutral-800 pb-2 text-base font-semibold">{t('Application')}</h2>
    <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span>{t('Language')}</span>
      <select value={language} onChange={(event) => void savePreferences({ language: event.target.value === 'es' ? 'es' : 'en', checkForUpdatesOnStartup })} className="h-9 rounded bg-neutral-800 px-3">
        <option value="en">English</option><option value="es">Español</option>
      </select>
    </label>
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{t('Check on startup')}</span>
      <input type="checkbox" checked={checkForUpdatesOnStartup} onChange={(event) => void savePreferences({ language, checkForUpdatesOnStartup: event.target.checked })} />
    </label>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <UpdateControls />
  </section>
}

function useUpdateState() {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    if (typeof window.api.getUpdateState !== 'function' || typeof window.api.onUpdateState !== 'function') return
    let cancelled = false
    let receivedEvent = false
    const unsubscribe = window.api.onUpdateState((next) => { receivedEvent = true; setState(next) })
    window.api.getUpdateState().then((next) => { if (!cancelled && !receivedEvent) setState(next) }).catch((failure) => {
      if (!cancelled) setState({ status: 'error', currentVersion: '', error: String(failure) })
    })
    return () => { cancelled = true; unsubscribe() }
  }, [])
  return state
}

function UpdateControls({ state: provided }: { state?: UpdateState }) {
  useLocale()
  const received = useUpdateState()
  const state = provided ?? received
  const [requestError, setRequestError] = useState<string | null>(null)
  async function request(action: () => Promise<unknown>) {
    setRequestError(null)
    try { await action() } catch (failure) { setRequestError(String(failure)) }
  }
  if (!state) return <p className="text-sm text-neutral-400">{t('Restart WorldTube to enable updates')}</p>
  const buttonClass = 'wt-action inline-flex min-h-9 items-center gap-2 rounded px-3 text-sm'
  return <div className="grid gap-3 border-t border-neutral-800 pt-3">
    <p className="text-sm text-neutral-400">{t('Installed version: {version}', { version: state.currentVersion })}</p>
    {state.status === 'development' ? <p className="text-sm text-neutral-500">{t('Updates are available in installed builds')}</p> : <>
      {state.status === 'available' && <p className="text-sm">{t('Available version: {version}', { version: state.version ?? '' })}</p>}
      {state.status === 'checking' && <p role="status" className="text-sm">{t('Checking for updates...')}</p>}
      {state.status === 'current' && <p role="status" className="text-sm">{t('You are up to date')}</p>}
      {state.status === 'downloading' && <><p role="status" className="text-sm">{t('Downloading: {percent}%', { percent: Math.round(state.percent ?? 0) })}</p>
        <progress value={state.percent ?? 0} max={100} className="h-1 w-full accent-[var(--wt-accent)]" /></>}
      {state.status === 'downloaded' && <p className="text-sm">{t('Update ready to install')}</p>}
      {state.version && <a href="https://github.com/riberojuanca/worldtube/releases" target="_blank" rel="noreferrer" className="wt-link text-sm">{t('Release notes')}</a>}
      {(state.error || requestError) && <p role="alert" className="break-words text-sm text-red-400">{requestError ?? state.error}</p>}
      <div className="flex flex-wrap gap-2">
        {['idle', 'current', 'error'].includes(state.status) && <button type="button" className={buttonClass} onClick={() => void request(window.api.checkForUpdates)}>{t('Check for updates')}</button>}
        {state.status === 'available' && <button type="button" className={buttonClass} onClick={() => void request(window.api.downloadUpdate)}>{t('Download update')}</button>}
        {state.status === 'downloaded' && <button type="button" className={buttonClass} onClick={() => void request(window.api.installUpdate)}>{t('Restart and install')}</button>}
      </div>
    </>}
  </div>
}

export function UpdateNotice() {
  useLocale()
  const state = useUpdateState()
  const [dismissedVersion, setDismissedVersion] = useState<string | undefined>()
  if (!state || !['available', 'downloading', 'downloaded'].includes(state.status) || dismissedVersion === state.version) return null
  return <aside aria-label={t('Updates')} className="fixed right-4 top-[70px] z-[80] w-[min(360px,calc(100vw-32px))] rounded border border-neutral-700 bg-neutral-900 p-3 shadow-xl">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-medium">{t('Updates')}</h2>
      <button type="button" title={t('Cerrar')} aria-label={t('Cerrar')} onClick={() => setDismissedVersion(state.version)} className="grid h-8 w-8 cursor-pointer place-items-center rounded hover:bg-neutral-800">
        <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
      </button>
    </div>
    <UpdateControls state={state} />
  </aside>
}
