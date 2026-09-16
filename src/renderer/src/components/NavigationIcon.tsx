import { Bookmark, CircleUserRound, Clapperboard, History, House, ListVideo, Music2, type LucideIcon } from 'lucide-react'
import { useId } from 'react'

type NavigationIconName = 'home' | 'subscriptions' | 'history' | 'saved' | 'playlists' | 'music' | 'account'

const icons: Record<NavigationIconName, LucideIcon> = {
  home: House,
  subscriptions: Clapperboard,
  history: History,
  saved: Bookmark,
  playlists: ListVideo,
  music: Music2,
  account: CircleUserRound
}

export function NavigationIcon({ name }: { name: NavigationIconName }) {
  const Icon = icons[name]
  const gradientId = `wt-nav-gradient-${useId().replace(/:/g, '')}`
  return <span className="wt-navigation-icon-shell">
    <Icon aria-hidden="true" className="wt-navigation-icon h-5 w-5 shrink-0" stroke={`url(#${gradientId})`} strokeWidth={1.8}>
      <defs>
        <linearGradient id={gradientId} x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop className="wt-navigation-icon-start" />
          <stop className="wt-navigation-icon-end" offset="1" />
        </linearGradient>
      </defs>
    </Icon>
  </span>
}
