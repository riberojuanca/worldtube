import { t, useLocale } from '../i18n/LocaleContext'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { VideoSaveActions } from '../components/VideoSaveButton'
import { VideoThumbnail } from '../components/VideoCard'
import { SHORTS_SLOT_ID } from './GlobalPlayerHost'
import { useGlobalPlayer } from './GlobalPlayerContext'

export function ShortsModal() {
  useLocale()
  const { shorts, videoId, status, error, openShort, playVideo, closePlayer, dismissShorts, ownerTabId } = useGlobalPlayer()
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const location = useLocation()
  const previousPath = useRef(location.pathname)
  const isOpen = shorts.length > 0
  const index = shorts.findIndex((short) => short.videoId === videoId)
  const short = shorts[index]
  const [slide, setSlide] = useState<{ direction: number; videoId: string; thumbnailUrl: string | null; title: string } | null>(null)

  useEffect(() => {
    if (!slide) return
    const timer = window.setTimeout(() => setSlide(null), 340)
    return () => window.clearTimeout(timer)
  }, [slide])

  useEffect(() => { if (!isOpen) setSlide(null) }, [isOpen])

  useEffect(() => {
    if (previousPath.current !== location.pathname) dismissShorts()
    previousPath.current = location.pathname
  }, [location.pathname, dismissShorts])

  useEffect(() => {
    if (!isOpen) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!dialog.open) dialog.showModal()
    dialog.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  function move(direction: number) {
    const next = shorts[index + direction]
    if (!next || !short || slide) return
    let thumbnailUrl = short.thumbnailUrl
    const video = dialogRef.current?.querySelector('video')
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(video.videoWidth, 420)
        canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth)
        const context = canvas.getContext('2d')
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height)
          thumbnailUrl = canvas.toDataURL('image/jpeg', 0.85)
        }
      } catch { /* Use the thumbnail when the frame cannot be captured. */ }
    }
    setSlide({ direction, videoId: short.videoId, thumbnailUrl, title: short.title })
    openShort(next.videoId, shorts)
  }

  return <dialog ref={dialogRef} aria-labelledby="shorts-title" tabIndex={-1}
    onCancel={(event) => { event.preventDefault(); closePlayer() }}
    onClick={(event) => { if (event.target === event.currentTarget) closePlayer() }}
    style={{ width: 'min(420px, calc((100dvh - 112px) * 9 / 16), calc(100vw - 112px))' }}
    className="fixed inset-0 m-auto max-h-none max-w-none overflow-visible rounded border-0 bg-neutral-950 p-0 text-neutral-100 shadow-2xl backdrop:bg-black/80">
    <h2 id="shorts-title" className="sr-only">Shorts</h2>
    <div className="group/short-video relative aspect-[9/16] w-full overflow-hidden rounded bg-black">
      <div className={`absolute inset-0 ${slide ? slide.direction > 0 ? 'wt-short-enter-next' : 'wt-short-enter-previous' : ''}`}>
      <div id={`${SHORTS_SLOT_ID}-${ownerTabId}`} className="h-full w-full" />
      {status === 'loading' && <div role="status" className="pointer-events-none absolute inset-0 bg-black text-sm text-neutral-300">
        {short && <VideoThumbnail videoId={short.videoId} thumbnailUrl={short.thumbnailUrl} title={short.title} />}
        <span className="absolute inset-0 grid place-items-center bg-black/40">{t("Cargando...")}</span>
      </div>}
      {status === 'error' && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-3 text-center text-sm">
        <p className="line-clamp-3 break-words">{error}</p>
        <button type="button" onClick={() => videoId && void playVideo(videoId)} className="rounded bg-neutral-800 px-3 py-2">{t("Reintentar")}</button>
      </div>}
      </div>
      {slide && <div aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-black ${slide.direction > 0 ? 'wt-short-leave-next' : 'wt-short-leave-previous'}`}>
        <VideoThumbnail videoId={slide.videoId} thumbnailUrl={slide.thumbnailUrl} title={slide.title} />
      </div>}
    </div>
    <div className="h-16 min-w-0 overflow-hidden px-2 py-2">
      {short && <>
        <p className="line-clamp-2 break-words text-sm font-medium leading-4">{short.title}</p>
        <p className="truncate text-xs leading-4 text-neutral-400">{short.channelName}</p>
      </>}
    </div>
    <div className="absolute bottom-16 left-[calc(100%+12px)] top-0 flex w-9 flex-col justify-between">
      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={closePlayer} aria-label={t("Cerrar Short")} title={t("Cerrar")}
          className="grid h-9 w-9 place-items-center rounded bg-neutral-800 text-xl hover:bg-neutral-700">{'\u00d7'}</button>
        {index >= 0 && <span className="w-full text-center text-[10px] leading-4 text-neutral-300">{index + 1}<span className="text-neutral-500"> / </span>{shorts.length}</span>}
      </div>
      <div className="absolute top-1/2 flex -translate-y-1/2 flex-col gap-3">
      <button type="button" onClick={() => move(-1)} disabled={index <= 0 || Boolean(slide)} aria-label={t("Short anterior")} title={t("Anterior")}
        className="grid h-9 w-9 place-items-center rounded bg-neutral-800 text-lg hover:bg-neutral-700 disabled:cursor-default disabled:opacity-30">{'\u2191'}</button>
      <button type="button" onClick={() => move(1)} disabled={index < 0 || index >= shorts.length - 1 || Boolean(slide)} aria-label={t("Siguiente Short")} title={t("Siguiente")}
        className="grid h-9 w-9 place-items-center rounded bg-neutral-800 text-lg hover:bg-neutral-700 disabled:cursor-default disabled:opacity-30">{'\u2193'}</button>
      </div>
      {short && <VideoSaveActions key={`save-${short.videoId}`} buttonClassName="grid h-9 w-9 place-items-center rounded bg-neutral-800 text-sm hover:bg-neutral-700 disabled:opacity-40" video={{ ...short, playlistId: null }} />}
    </div>
  </dialog>
}
