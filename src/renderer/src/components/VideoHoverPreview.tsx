import { useEffect, useState } from 'react'
import type { VideoPreview } from '../../../shared/ipc'

export function VideoHoverPreview({ videoId, previewUrl }: { videoId: string; previewUrl?: string | null }) {
  const [preview, setPreview] = useState<VideoPreview | null>(null)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    let cancelled = false
    let image: HTMLImageElement | null = null
    let interval: ReturnType<typeof setInterval> | undefined
    setPreview(null)
    setFrame(0)
    async function load(useNative = true) {
      const native = useNative && previewUrl
      const value = native ? { imageUrl: previewUrl!, columns: 1, rows: 1, frameCount: 1 }
        : typeof window.api?.getVideoPreview === 'function' ? await window.api.getVideoPreview(videoId).catch(() => null) : null
      if (cancelled || !value) return
      image = new Image()
      image.onload = () => {
        if (cancelled) return
        setPreview(value)
        if (value.frameCount > 1) interval = setInterval(() => setFrame((index) => (index + 1) % value.frameCount), 400)
      }
      image.onerror = () => {
        if (cancelled) return
        if (native) void load(false)
        else setPreview(null)
      }
      image.src = value.imageUrl
    }
    void load()
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
      if (image) { image.onload = null; image.onerror = null; image.src = '' }
    }
  }, [videoId, previewUrl])

  const column = preview ? frame % preview.columns : 0
  const row = preview ? Math.floor(frame / preview.columns) : 0
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded">
    {preview && (preview.columns === 1 && preview.rows === 1
      ? <img src={preview.imageUrl} alt="" className="h-full w-full object-cover" onError={() => setPreview(null)} />
      : <div className="h-full w-full bg-neutral-900 bg-no-repeat"
    style={{ backgroundImage: `url(${JSON.stringify(preview.imageUrl)})`,
      backgroundSize: `${preview.columns * 100}% ${preview.rows * 100}%`,
      backgroundPosition: `${preview.columns > 1 ? column / (preview.columns - 1) * 100 : 0}% ${preview.rows > 1 ? row / (preview.rows - 1) * 100 : 0}%` }} />)}
  </div>
}
