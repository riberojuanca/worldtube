import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfiles } from '../profiles/ProfileContext'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import type { SavedPlaylist, SavedVideo } from '../../../shared/ipc'

function formatUpdatedAt(timestampMs: number): string {
  if (!timestampMs) return 'Sin fecha'
  return new Date(timestampMs).toLocaleDateString()
}

export function Playlists() {
  const [playlists, setPlaylists] = useState<SavedPlaylist[] | null>(null)
  const [videos, setVideos] = useState<SavedVideo[]>([])
  const { activeProfileId } = useProfiles()

  useEffect(() => {
    let cancelled = false
    const loadPlaylists = () => {
      setPlaylists(null)
      Promise.all([window.api.listSavedPlaylists(), window.api.listSavedVideos()]).then(([playlistItems, videoItems]) => {
        if (cancelled) return
        setPlaylists(playlistItems)
        setVideos(videoItems)
      })
    }

    loadPlaylists()
    window.addEventListener(PROFILE_DATA_CHANGED_EVENT, loadPlaylists)

    return () => {
      cancelled = true
      window.removeEventListener(PROFILE_DATA_CHANGED_EVENT, loadPlaylists)
    }
  }, [activeProfileId])

  if (playlists === null) return <p className="text-sm text-neutral-400">Cargando…</p>

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Playlists</h1>
      {playlists.length === 0 ? (
        <p className="text-sm text-neutral-400">No hay playlists guardadas.</p>
      ) : (
        <div className="divide-y divide-neutral-800 border-y border-neutral-800">
          {playlists.map((playlist) => (
            <article key={playlist.id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)] md:items-start">
              <div className="min-w-0">
                <h2 className="truncate font-medium">{playlist.name}</h2>
                {playlist.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{playlist.description}</p>}
                <p className="mt-1 text-xs text-neutral-500">
                  {videos.filter((video) => video.playlistId === playlist.id).length} videos · Actualizada {formatUpdatedAt(playlist.updatedAt)}
                </p>
              </div>
              <div className="grid gap-1">
                {videos
                  .filter((video) => video.playlistId === playlist.id)
                  .slice(0, 3)
                  .map((video) => (
                    <Link
                      key={video.id}
                      to={`/watch/${video.videoId}`}
                      className="truncate rounded px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"
                    >
                      {video.title}
                    </Link>
                  ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
