import { t, useLocale } from '../i18n/LocaleContext'
import { useEffect, useMemo, useState } from 'react'
import { VideoCard } from '../components/VideoCard'
import { useProfiles } from '../profiles/ProfileContext'
import { RecommendedChannels } from '../components/RecommendedChannels'
import type { HomeDiscovery, SearchResultItem } from '../../../shared/ipc'

type FeedStatus = 'loading' | 'ready' | 'error'

export function Home() {
  useLocale()
  const { activeProfileId } = useProfiles()
  const [feedStatus, setFeedStatus] = useState<FeedStatus>('loading')
  const [feed, setFeed] = useState<SearchResultItem[]>([])
  const [feedError, setFeedError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [discovery, setDiscovery] = useState<HomeDiscovery | null>(null)

  useEffect(() => {
    let cancelled = false
    setFeedStatus('loading')
    setFeedError(null)
    async function loadFeed() {
      try {
        const response = await window.api.getHomeFeed()
        if (cancelled) return
        if (!response.ok) throw new Error(response.error)
        setFeed(response.data)
        setDiscovery(response.home ?? null)
        setFeedStatus('ready')
      } catch (error) {
        if (cancelled) return
        setFeedError(error instanceof Error ? error.message : String(error))
        setFeedStatus('error')
      }
    }
    void loadFeed()
    return () => { cancelled = true }
  }, [attempt, activeProfileId])

  const sections = useMemo(() => {
    const displayed = new Set(feed.slice(0, 5).map((video) => video.videoId))
    return (discovery?.sections ?? []).map((section) => {
      const videos = section.videos.filter((video) => !displayed.has(video.videoId)).slice(0, 8)
      videos.forEach((video) => displayed.add(video.videoId))
      return { ...section, videos }
    }).filter((section) => section.videos.length)
  }, [feed, discovery])

  const videoTile = (video: SearchResultItem) => <VideoCard key={video.videoId} {...video} badge={video.durationText}
    meta={[video.viewCountText, video.publishedText].filter(Boolean).join(' · ')} />

  return (
    <section aria-label={t('Inicio')} aria-busy={feedStatus === 'loading'}>
      <h1 className="mb-4 text-xl font-semibold">{t('Inicio')}</h1>
      {feedStatus === 'loading' && <>
        <span className="sr-only" role="status">{t('Cargando inicio…')}</span>
        <div aria-hidden="true" className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, index) => <div key={index} className="motion-safe:animate-pulse">
            <div className="aspect-video w-full rounded bg-neutral-900" />
            <div className="mt-3 h-4 w-4/5 rounded bg-neutral-800" />
            <div className="mt-2 h-3 w-1/2 rounded bg-neutral-900" />
          </div>)}
        </div>
      </>}
      {feedStatus === 'error' && <div role="alert" className="border-y border-neutral-800 py-6">
        <p className="mb-3 text-sm text-red-400">{feedError}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="wt-action cursor-pointer rounded px-4 py-2 text-sm font-medium">{t('Retry')}</button>
      </div>}
      {feedStatus === 'ready' && feed.length === 0 && <p className="py-6 text-sm text-neutral-400">{t('No videos available')}</p>}
      {feedStatus === 'ready' && <div className="space-y-8">
        {feed[0] && <section>
          <h2 className="mb-3 text-lg font-semibold">{t('For you')}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">{videoTile(feed[0])}</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{feed.slice(1, 5).map(videoTile)}</div>
          </div>
        </section>}
        {discovery && <section className="border-t border-neutral-800 pt-6">
          <h2 className="mb-3 text-lg font-semibold">{t('Live now')}</h2>
          {discovery.liveVideos.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{discovery.liveVideos.slice(0, 8).map(videoTile)}</div>
            : <p className="text-sm text-neutral-400">{t('No related live streams right now')}</p>}
        </section>}
        {discovery && discovery.channels.length > 0 && <section className="border-t border-neutral-800 pt-6">
          <h2 className="mb-3 text-lg font-semibold">{t('Channels to discover')}</h2>
          <RecommendedChannels channels={discovery.channels} />
        </section>}
        {sections.map((section) => <section key={section.id} className="border-t border-neutral-800 pt-6">
          {section.topic && <p className="wt-accent-text mb-1 text-sm font-medium">{section.topic}</p>}
          <h2 className="mb-3 break-words text-lg font-semibold">{t('Because you watched')}: <span className="font-normal text-neutral-400">{section.title}</span></h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{section.videos.map(videoTile)}</div>
        </section>)}
        {!sections.length && feed.length > 5 && <section className="border-t border-neutral-800 pt-6">
          <h2 className="mb-3 text-lg font-semibold">{t('More to explore')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{feed.slice(5).map(videoTile)}</div>
        </section>}
      </div>}
    </section>
  )
}
