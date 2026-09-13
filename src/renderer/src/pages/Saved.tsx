import { useEffect, useState } from 'react'
import { VideoCard } from '../components/VideoCard'
import { useProfiles } from '../profiles/ProfileContext'
import type { SavedVideo } from '../../../shared/ipc'

function formatSavedAt(timestampMs: number): string {
  if (!timestampMs) return 'Guardado'
  return `Guardado ${new Date(timestampMs).toLocaleDateString()}`
}

export function Saved() {
  const [videos, setVideos] = useState<SavedVideo[] | null>(null)
  const { activeProfileId } = useProfiles()

  useEffect(() => {
    let cancelled = false
    setVideos(null)
    window.api.listSavedVideos().then((items) => {
      if (!cancelled) setVideos(items)
    })
    return () => {
      cancelled = true
    }
  }, [activeProfileId])

  if (videos === null) return <p className="text-sm text-neutral-400">Cargando…</p>

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Guardados</h1>
      {videos.length === 0 ? (
        <p className="text-sm text-neutral-400">No hay videos guardados.</p>
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
