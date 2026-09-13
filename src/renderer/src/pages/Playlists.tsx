import { useEffect, useState } from 'react'
import { useProfiles } from '../profiles/ProfileContext'
import type { SavedPlaylist } from '../../../shared/ipc'

function formatUpdatedAt(timestampMs: number): string {
  if (!timestampMs) return 'Sin fecha'
  return new Date(timestampMs).toLocaleDateString()
}

export function Playlists() {
  const [playlists, setPlaylists] = useState<SavedPlaylist[] | null>(null)
  const { activeProfileId } = useProfiles()

  useEffect(() => {
    let cancelled = false
    setPlaylists(null)
    window.api.listSavedPlaylists().then((items) => {
      if (!cancelled) setPlaylists(items)
    })
    return () => {
      cancelled = true
    }
  }, [activeProfileId])

  if (playlists === null) return <p className="text-sm text-neutral-400">Cargando…</p>

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Playlists</h1>
      {playlists.length === 0 ? (
        <p className="text-sm text-neutral-400">No hay playlists guardadas.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {playlists.map((playlist) => (
            <article key={playlist.id} className="border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="truncate font-medium">{playlist.name}</h2>
              {playlist.description && <p className="mt-2 line-clamp-3 text-sm text-neutral-400">{playlist.description}</p>}
              <p className="mt-3 text-xs text-neutral-500">Actualizada {formatUpdatedAt(playlist.updatedAt)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
