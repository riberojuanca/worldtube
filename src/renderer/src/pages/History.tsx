import { t, useLocale, locale } from '../i18n/LocaleContext'
import { useEffect, useState } from 'react'
import { VideoCard } from '../components/VideoCard'
import { PageLoader } from '../components/PageLoader'
import { useProfiles } from '../profiles/ProfileContext'
import type { HistoryEntry } from '../../../shared/ipc'

function formatWatchedAt(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs
  const diffMinutes = Math.round(diffMs / 60_000)
  if (diffMinutes < 1) return t("Recién")
  if (diffMinutes < 60) return t('Hace {count} min', { count: diffMinutes })
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return t('Hace {count} h', { count: diffHours })
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 30) return t('Hace {count} d', { count: diffDays })
  return new Date(timestampMs).toLocaleDateString(locale())
}

export function History() {
  useLocale()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const { activeProfileId } = useProfiles()

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    window.api.getHistory().then((items) => {
      if (!cancelled) setEntries(items)
    })
    return () => {
      cancelled = true
    }
  }, [activeProfileId])

  async function handleClear() {
    await window.api.clearHistory()
    setEntries([])
  }

  if (entries === null) return <PageLoader />

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("Historial")}</h1>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
          >
            {t("Borrar historial")}</button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-neutral-400">{t("Todavía no viste ningún video.")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map((entry) => (
            <VideoCard
              key={entry.videoId}
              videoId={entry.videoId}
              title={entry.title}
              channelId={entry.channelId}
              channelName={entry.channelName}
              thumbnailUrl={entry.thumbnailUrl}
              meta={formatWatchedAt(entry.watchedAt)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
