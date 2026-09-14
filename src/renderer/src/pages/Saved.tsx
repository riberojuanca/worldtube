import { t, useLocale, locale } from '../i18n/LocaleContext'
import { useEffect, useState } from 'react'
import { VideoCard } from '../components/VideoCard'
import { PageLoader } from '../components/PageLoader'
import { useProfiles } from '../profiles/ProfileContext'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import type { SavedVideo } from '../../../shared/ipc'

function formatSavedAt(timestampMs: number): string {
  if (!timestampMs) return t("Guardado")
  return t('Guardado {date}', { date: new Date(timestampMs).toLocaleDateString(locale()) })
}

export function Saved() {
  useLocale()
  const [videos, setVideos] = useState<SavedVideo[] | null>(null)
  const { activeProfileId } = useProfiles()

  useEffect(() => {
    let cancelled = false
    const loadVideos = () => {
      setVideos(null)
      window.api.listSavedVideos(null).then((items) => {
        if (!cancelled) setVideos(items)
      })
    }

    loadVideos()
    window.addEventListener(PROFILE_DATA_CHANGED_EVENT, loadVideos)

    return () => {
      cancelled = true
      window.removeEventListener(PROFILE_DATA_CHANGED_EVENT, loadVideos)
    }
  }, [activeProfileId])

  if (videos === null) return <PageLoader />

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{t("Guardados")}</h1>
      {videos.length === 0 ? (
        <p className="text-sm text-neutral-400">{t("No hay videos guardados.")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              videoId={video.videoId}
              title={video.title}
              channelId={video.channelId}
              channelName={video.channelName}
              thumbnailUrl={video.thumbnailUrl}
              meta={formatSavedAt(video.savedAt)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
