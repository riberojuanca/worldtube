import { Link } from 'react-router-dom'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ChannelAvatar } from './ChannelAvatar'
import { t, useLocale } from '../i18n/LocaleContext'
import type { RecommendedChannel } from '../../../shared/ipc'

export function RecommendedChannels({ channels }: { channels: RecommendedChannel[] }) {
  useLocale()
  const viewport = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(1)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const update = () => {
      setColumns(Math.max(1, Math.min(channels.length || 1, Math.floor(element.clientWidth / 160))))
      setCanBack(element.scrollLeft > 1)
      setCanForward(element.scrollLeft + element.clientWidth < element.scrollWidth - 1)
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    element.addEventListener('scroll', update, { passive: true })
    update()
    return () => { observer.disconnect(); element.removeEventListener('scroll', update) }
  }, [channels.length, columns])
  const scroll = (direction: number) => {
    const element = viewport.current
    if (element) element.scrollBy({ left: element.clientWidth * direction, behavior: 'smooth' })
  }
  return <div className="relative min-w-0">
    <div ref={viewport} className="grid auto-cols-[var(--channel-width)] grid-flow-col gap-0 overflow-x-auto pb-3" style={{ '--channel-width': `${100 / columns}%` } as CSSProperties}>
    {channels.map((channel) => <Link key={channel.channelId} to={`/channel/${channel.channelId}`}
      className="flex min-w-0 flex-col items-center gap-2 rounded px-1 py-3 text-center hover:bg-neutral-900">
      <ChannelAvatar name={channel.name} thumbnailUrl={channel.thumbnailUrl} imageSize={512} className="aspect-square w-full max-w-48" />
      <span className="line-clamp-2 w-full break-words text-sm font-medium text-neutral-100">{channel.name}</span>
      {channel.subscriberCountText && <span className="line-clamp-2 text-xs text-neutral-400">{channel.subscriberCountText}</span>}
    </Link>)}
    </div>
    {canBack && <button type="button" onClick={() => scroll(-1)} aria-label={t('Previous channels')} title={t('Previous channels')} className="absolute left-0 top-20 grid h-9 w-9 cursor-pointer place-items-center rounded border border-neutral-700 bg-neutral-900 text-2xl text-white shadow hover:bg-neutral-800">&#8249;</button>}
    {canForward && <button type="button" onClick={() => scroll(1)} aria-label={t('Next channels')} title={t('Next channels')} className="absolute right-0 top-20 grid h-9 w-9 cursor-pointer place-items-center rounded border border-neutral-700 bg-neutral-900 text-2xl text-white shadow hover:bg-neutral-800">&#8250;</button>}
  </div>
}
