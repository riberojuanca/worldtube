import { t, useLocale } from './i18n/LocaleContext'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { GlobalPlayerProvider, useGlobalPlayer } from './player/GlobalPlayerContext'
import { GlobalPlayerHost, MINI_SLOT_ID } from './player/GlobalPlayerHost'
import { MusicMiniPlayer } from './player/MusicPlayer'
import { ShortsModal } from './player/ShortsModal'
import { PLAYER_COMMAND_EVENT, PLAYER_STATE_EVENT, type PlayerCommandDetail, type PlayerStateDetail } from './player/events'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ChannelAvatar } from './components/ChannelAvatar'
import { BrandMark } from './components/BrandMark'
import { NavigationIcon } from './components/NavigationIcon'
import { UpdateNotice } from './components/ApplicationSettings'
import { ProfileProvider, useProfiles } from './profiles/ProfileContext'
import { PROFILE_DATA_CHANGED_EVENT } from './profiles/events'
import { Channel } from './pages/Channel'
import { Collection } from './pages/Collection'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { Music } from './pages/Music'
import { Account } from './pages/Account'
import { Playlists } from './pages/Playlists'
import { Saved } from './pages/Saved'
import { Search } from './pages/Search'
import { Subscriptions } from './pages/Subscriptions'
import { Watch } from './pages/Watch'
import { TabBar, TabPages, TabLinkHandler } from './tabs/AppTabs'
import { useAppTabs, usePageTab } from './tabs/AppTabs'
import { PlayerWorkspaceProvider, RegisterTabPlayer, usePlayerWorkspace } from './player/PlayerWorkspace'
import type { SearchHistoryEntry, Subscription, UserProfile } from '../../shared/ipc'

type IconName =
  | 'arrowDownRight'
  | 'arrowUpRight'
  | 'back'
  | 'forward'
  | 'forward10'
  | 'history'
  | 'pause'
  | 'pictureInPicture'
  | 'play'
  | 'replay10'
  | 'rewind'
  | 'refresh'
  | 'search'
  | 'user'
  | 'volume'
  | 'x'

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  useLocale()
  const paths: Record<IconName, JSX.Element> = {
    arrowDownRight: <path d="m17 7-10 10M7 9v8h8" />,
    arrowUpRight: <path d="M7 17 17 7M9 7h8v8" />,
    back: <path d="M15 6 9 12l6 6M10 12h11" />,
    forward: <path d="m9 6 6 6-6 6M14 12H3" />,
    forward10: (
      <>
        <path d="M15 5h4v4" />
        <path d="M18.5 9A7 7 0 1 0 17 17.3" />
        <text fill="currentColor" fontSize="7" fontWeight="700" stroke="none" textAnchor="middle" x="12" y="15.5">
          10
        </text>
      </>
    ),
    history: <path d="M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />,
    pause: <path d="M8 5v14M16 5v14" />,
    pictureInPicture: <><rect x="3" y="5" width="18" height="14" rx="2" /><rect x="11" y="11" width="7" height="5" rx="1" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    replay10: (
      <>
        <path d="M9 5H5v4" />
        <path d="M5.5 9A7 7 0 1 1 7 17.3" />
        <text fill="currentColor" fontSize="7" fontWeight="700" stroke="none" textAnchor="middle" x="12" y="15.5">
          10
        </text>
      </>
    ),
    rewind: <path d="m11 19-8-7 8-7v14Zm10 0-8-7 8-7v14Z" />,
    refresh: <path d="M20 7v5h-5M19.2 12a7.2 7.2 0 1 0-2 5M20 12l-2-5" />,
    search: <path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4z" />,
    user: <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />,
    volume: <path d="M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />,
    x: <path d="M6 6l12 12M18 6 6 18" />
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  )
}

function profileInitial(profile: UserProfile): string {
  return profile.name.trim().slice(0, 1).toUpperCase() || 'P'
}

function getProfileTextColor(color: string): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(color) ? color : '#525252'
  const red = parseInt(normalized.slice(1, 3), 16)
  const green = parseInt(normalized.slice(3, 5), 16)
  const blue = parseInt(normalized.slice(5, 7), 16)
  return (red * 299 + green * 587 + blue * 114) / 1000 > 145 ? '#111111' : '#ffffff'
}

function ProfileAvatar({ profile, className = 'h-7 w-7' }: { profile: UserProfile; className?: string }) {
  useLocale()
  if (profile.avatarDataUrl) {
    return <img src={profile.avatarDataUrl} alt="" className={`${className} shrink-0 rounded object-cover`} />
  }

  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded text-xs font-bold`}
      style={{ backgroundColor: profile.color, color: profile.textColor }}
    >
      {profileInitial(profile)}
    </span>
  )
}

function ProfileMenu() {
  useLocale()
  const { profiles, activeUser, activeProfile, activeProfileId, setActiveProfile, updateProfile, logoutLocalUser } = useProfiles()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [editProfileName, setEditProfileName] = useState(activeProfile.name)
  const [editProfileColor, setEditProfileColor] = useState(activeProfile.color)
  const [editProfileAvatar, setEditProfileAvatar] = useState<string | null>(activeProfile.avatarDataUrl)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      menuRef.current?.querySelector('button')?.focus()
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen])

  useEffect(() => {
    setEditProfileName(activeProfile.name)
    setEditProfileColor(activeProfile.color)
    setEditProfileAvatar(activeProfile.avatarDataUrl)
    setMessage(null)
    setError(null)
  }, [activeProfile])

  async function handleSelect(profileId: string) {
    if (profileId !== activeProfileId) {
      await setActiveProfile(profileId)
    }
    setMessage(null)
    setError(null)
    setIsOpen(false)
  }

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault()
    try {
      await updateProfile({
        id: activeProfile.id,
        name: editProfileName,
        color: editProfileColor,
        avatarDataUrl: editProfileAvatar
      })
      setMessage(t("Perfil guardado"))
      setError(null)
      setIsOpen(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(t("Elegí una imagen válida."))
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setEditProfileAvatar(typeof reader.result === 'string' ? reader.result : null)
      setError(null)
    }
    reader.onerror = () => setError(t("No se pudo leer la imagen."))
    reader.readAsDataURL(file)
  }

  const previewProfile: UserProfile = {
    ...activeProfile,
    name: editProfileName || activeProfile.name,
    color: editProfileColor,
    textColor: getProfileTextColor(editProfileColor),
    avatarDataUrl: editProfileAvatar
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-label={t("Perfiles")}
        title={activeProfile.name}
        className="flex h-10 min-w-0 items-center gap-2 rounded px-2 text-sm text-neutral-200 hover:bg-neutral-800"
      >
        <ProfileAvatar profile={activeProfile} />
        <span className="max-w-24 truncate max-[860px]:hidden">{activeProfile.name}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-72 border border-neutral-800 bg-neutral-900 p-2 shadow-2xl shadow-black/40">
          <form onSubmit={handleSaveProfile} className="mb-2 grid gap-2 border-b border-neutral-800 px-2 pb-2">
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar profile={previewProfile} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-100">{editProfileName || activeProfile.name}</p>
                <p className="truncate text-xs text-neutral-500">{t("Usuario local:")} {activeUser.name}</p>
              </div>
            </div>
            <input
              value={editProfileName}
              onChange={(event) => setEditProfileName(event.target.value)}
              aria-label={t("Nombre del perfil")}
              className="h-9 rounded border border-neutral-700 bg-neutral-950 px-2 text-sm outline-none focus:border-neutral-500"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={editProfileColor}
                onChange={(event) => setEditProfileColor(event.target.value)}
                type="color"
                aria-label={t("Color del perfil")}
                className="h-9 w-11 rounded border border-neutral-700 bg-neutral-950 p-1"
              />
              <label className="cursor-pointer rounded bg-neutral-800 px-2 py-2 text-sm text-neutral-100 hover:bg-neutral-700">
                {t("Foto")}<input type="file" accept="image/*" onChange={handleAvatarFile} className="hidden" />
              </label>
              {editProfileAvatar && (
                <button type="button" onClick={() => setEditProfileAvatar(null)} className="rounded px-2 py-2 text-sm text-neutral-400 hover:bg-neutral-800">
                  {t("Quitar")}</button>
              )}
              <button type="submit" className="wt-action ml-auto rounded px-2 py-2 text-sm font-medium">
                {t("Guardar")}</button>
            </div>
            {(message || error) && <p className={['text-xs', error ? 'text-red-400' : 'text-neutral-400'].join(' ')}>{t(error ?? message ?? '')}</p>}
          </form>
          <div className="grid gap-1">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleSelect(profile.id)}
                className={[
                  'flex min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-neutral-800',
                  profile.id === activeProfileId ? 'wt-selected' : 'text-neutral-300'
                ].join(' ')}
              >
                <ProfileAvatar profile={profile} />
                <span className="truncate">{profile.name}</span>
              </button>
            ))}
          </div>

          <div className="mt-2 grid gap-2 border-t border-neutral-800 pt-2">
            <button
              type="button"
              onClick={logoutLocalUser}
              className="h-9 rounded px-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            >
              {t("Cerrar sesión")}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function SearchBar() {
  useLocale()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  const navigate = useNavigate()
  const { activeProfileId } = useProfiles()

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '')
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    if (typeof window.api.listSearchHistory !== 'function') {
      setHistory([])
      return
    }
    window.api
      .listSearchHistory()
      .then((entries) => {
        if (!cancelled) setHistory(entries)
      })
      .catch(() => {
        if (!cancelled) setHistory([])
      })
    return () => {
      cancelled = true
    }
  }, [activeProfileId])

  useEffect(() => {
    if (!isDropdownOpen) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!formRef.current?.contains(event.target as Node)) setIsDropdownOpen(false)
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer)

    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [isDropdownOpen])

  useEffect(() => {
    const trimmed = query.trim()
    if (!isDropdownOpen || !trimmed) {
      setSuggestions([])
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      if (typeof window.api.getSearchSuggestions !== 'function') {
        setSuggestions([])
        return
      }
      window.api.getSearchSuggestions(trimmed).then((response) => {
        if (cancelled) return
        setSuggestions(response.ok ? response.data.slice(0, 8) : [])
      })
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isDropdownOpen, query])

  async function runSearch(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    try {
      if (typeof window.api.recordSearchQuery === 'function') {
        const nextHistory = await window.api.recordSearchQuery(trimmed)
        setHistory(nextHistory)
      }
    } catch {
      // Search itself still works even if local history cannot be updated.
    }
    setIsDropdownOpen(false)
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    runSearch(query)
  }

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const recentMatches = history
    .filter((entry) => !normalizedQuery || entry.query.toLocaleLowerCase().includes(normalizedQuery))
    .slice(0, normalizedQuery ? 4 : 8)
  const recentNames = new Set(recentMatches.map((entry) => entry.query.toLocaleLowerCase()))
  const suggestionItems = normalizedQuery
    ? suggestions.filter((suggestion) => !recentNames.has(suggestion.toLocaleLowerCase())).slice(0, Math.max(0, 8 - recentMatches.length))
    : []
  const hasDropdownItems = recentMatches.length > 0 || suggestionItems.length > 0

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="relative flex w-full items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus-within:border-neutral-500">
        <Icon name="search" className="h-4 w-4 shrink-0 text-neutral-500" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIsDropdownOpen(true)
          }}
          onFocus={() => setIsDropdownOpen(true)}
          placeholder={t("Buscar / Ir a URL")}
          className="wt-search-input min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
      {isDropdownOpen && hasDropdownItems && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded border border-neutral-800 bg-neutral-950 py-1 shadow-2xl shadow-black/40">
          {recentMatches.map((entry) => (
            <button
              key={`history:${entry.query}`}
              type="button"
              onClick={() => {
                setQuery(entry.query)
                runSearch(entry.query)
              }}
              className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"
            >
              <Icon name="history" className="h-4 w-4 shrink-0 text-neutral-500" />
              <span className="truncate">{entry.query}</span>
            </button>
          ))}
          {suggestionItems.map((suggestion) => (
            <button
              key={`suggestion:${suggestion}`}
              type="button"
              onClick={() => {
                setQuery(suggestion)
                runSearch(suggestion)
              }}
              className="flex h-9 w-full items-center gap-2 px-3 text-left text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"
            >
              <Icon name="search" className="h-4 w-4 shrink-0 text-neutral-500" />
              <span className="truncate">{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  )
}

function TopNav() {
  useLocale()
  const navigate = useNavigate()
  const { refresh, activeId } = useAppTabs()
  const location = useLocation()
  const player = useGlobalPlayer()
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function refreshCurrentPage() {
    if (isRefreshing) return
    refresh()
    const videoId = location.pathname.startsWith('/watch/') ? location.pathname.split('/')[2] : null
    if (!videoId || player.ownerTabId !== activeId) return
    setIsRefreshing(true)
    try {
      await player.playVideo(videoId)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 grid h-[60px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-2 shadow-lg shadow-black/20 max-[680px]:fixed max-[680px]:inset-x-0 max-[680px]:top-0 max-[680px]:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            to="/"
            className="flex h-10 min-w-0 items-center gap-2 rounded px-2 text-lg font-semibold text-neutral-100 hover:bg-neutral-800"
            title="WorldTube"
          >
            <BrandMark />
            <span className="truncate max-[680px]:hidden">WorldTube</span>
          </Link>
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={t("Volver")}
            title={t("Volver")}
            className="grid h-10 w-10 place-items-center rounded-full text-neutral-300 hover:bg-neutral-800 hover:text-white max-[680px]:hidden"
          >
            <Icon name="back" />
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            aria-label={t('Avanzar')}
            title={t('Avanzar')}
            className="grid h-10 w-10 place-items-center rounded-full text-neutral-300 hover:bg-neutral-800 hover:text-white max-[680px]:hidden"
          >
            <Icon name="forward" />
          </button>
          <button
            type="button"
            onClick={() => void refreshCurrentPage()}
            disabled={isRefreshing}
            aria-label={t('Refresh')}
            title={t('Refresh')}
            className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:cursor-wait disabled:opacity-50"
          >
            <Icon name="refresh" />
          </button>
        </div>

        <div className="min-w-0 max-[680px]:hidden">
          <SearchBar />
        </div>

        <div className="flex justify-end gap-1">
          <ProfileMenu />
          <button
            type="button"
            onClick={() => setIsMobileSearchOpen((value) => !value)}
            aria-label={t("Buscar")}
            title={t("Buscar")}
            className="grid h-10 w-10 place-items-center rounded-full text-neutral-300 hover:bg-neutral-800 hover:text-white min-[681px]:hidden"
          >
            <Icon name="search" />
          </button>
        </div>
      </header>
      {isMobileSearchOpen && (
        <div className="fixed inset-x-0 top-[60px] z-40 border-b border-neutral-800 bg-neutral-900 p-2 min-[681px]:hidden">
          <SearchBar />
        </div>
      )}
    </>
  )
}

function navClass(isOpen: boolean, isActive: boolean): string {
  return [
    'group flex min-h-[45px] items-center px-3 py-2 text-neutral-300 no-underline transition-colors hover:bg-neutral-800 hover:text-white max-[680px]:min-h-0 max-[680px]:flex-1 max-[680px]:flex-col max-[680px]:justify-center max-[680px]:gap-0 max-[680px]:px-1',
    isOpen ? 'justify-start gap-3' : 'flex-col justify-center gap-0 text-center',
    isActive ? 'wt-selected' : ''
  ].join(' ')
}

function SideNav({ isOpen }: { isOpen: boolean }) {
  useLocale()
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const { activeProfileId } = useProfiles()

  useEffect(() => {
    let cancelled = false
    function loadSubscriptions() {
      setSubscriptions([])
      window.api.listSubscriptions().then((items) => {
        if (!cancelled) setSubscriptions(items.slice(0, 10))
      })
    }

    loadSubscriptions()
    window.addEventListener(PROFILE_DATA_CHANGED_EVENT, loadSubscriptions)
    return () => {
      cancelled = true
      window.removeEventListener(PROFILE_DATA_CHANGED_EVENT, loadSubscriptions)
    }
  }, [activeProfileId])

  return (
    <nav
      aria-label={t('Secciones')}
      className={[
        'sticky top-[60px] z-30 h-[calc(100vh-60px)] shrink-0 overflow-hidden border-r border-neutral-800 bg-neutral-900 transition-[width] duration-150 ease-in-out max-[680px]:fixed max-[680px]:inset-x-0 max-[680px]:bottom-0 max-[680px]:top-auto max-[680px]:h-[60px] max-[680px]:w-full max-[680px]:border-r-0 max-[680px]:border-t',
        isOpen ? 'w-[200px]' : 'w-20'
      ].join(' ')}
    >
      <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden py-3 max-[680px]:flex-row max-[680px]:items-stretch max-[680px]:overflow-hidden max-[680px]:py-0">
        <NavLink to="/" className={({ isActive }) => navClass(isOpen, isActive)} title={t("Inicio")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <NavigationIcon name="home" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>{t("Inicio")}</span>
        </NavLink>
        <NavLink to="/subscriptions" className={({ isActive }) => navClass(isOpen, isActive)} title={t("Suscripciones")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <NavigationIcon name="subscriptions" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>{t("Suscripciones")}</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => navClass(isOpen, isActive)} title={t("Historial")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <NavigationIcon name="history" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>{t("Historial")}</span>
        </NavLink>
        <NavLink to="/saved" className={({ isActive }) => navClass(isOpen, isActive)} title={t("Guardados")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <NavigationIcon name="saved" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>{t("Guardados")}</span>
        </NavLink>
        <NavLink to="/playlists" className={({ isActive }) => navClass(isOpen, isActive)} title={t("Playlists")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <NavigationIcon name="playlists" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>{t("Playlists")}</span>
        </NavLink>
        <NavLink to="/music" className={({ isActive }) => navClass(isOpen, isActive)} title={t("Music")}>
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <NavigationIcon name="music" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>{t("Music")}</span>
        </NavLink>

        {subscriptions.length > 0 && (
          <>
            <div className="mx-2 my-3 h-px bg-neutral-800 max-[680px]:hidden" />
            <div className="max-[680px]:hidden">
              {subscriptions.map((channel) => (
                <NavLink
                  key={channel.channelId}
                  to={`/channel/${channel.channelId}`}
                  className={({ isActive }) => navClass(isOpen, isActive)}
                  title={channel.channelName}
                >
                  <ChannelAvatar name={channel.channelName} thumbnailUrl={channel.thumbnailUrl} />
                  {isOpen && <span className="truncate text-sm">{channel.channelName}</span>}
                </NavLink>
              ))}
            </div>
          </>
        )}
        <div className="mt-auto border-t border-neutral-800 pt-3 max-[680px]:mt-0 max-[680px]:flex-1 max-[680px]:border-t-0 max-[680px]:pt-0">
          <NavLink to="/account" className={({ isActive }) => navClass(isOpen, isActive)} title={t("Cuenta")}>
            <span className="grid h-9 w-9 shrink-0 place-items-center">
              <NavigationIcon name="account" />
            </span>
            <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>{t("Cuenta")}</span>
          </NavLink>
        </div>
      </div>
    </nav>
  )
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function isMinimizeGesture(event: PointerEvent, drag: { startY: number; offsetY: number; height: number }): boolean {
  const draggedBottom = event.clientY - drag.offsetY + drag.height
  return event.clientY - drag.startY > 28 && draggedBottom >= window.innerHeight - 72
}

function isRangeControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input[type="range"], select, textarea, [role="slider"]'))
}

function MiniPlayer({ isSideNavOpen }: { isSideNavOpen: boolean }) {
  useLocale()
  const { videoId, title, channelName, closePlayer, playbackMode, shorts, ownerTabId } = useGlobalPlayer()
  const { activeId, select, navigatorFor, tabs: tabsForMini } = useAppTabs()
  function returnToWatch() {
    select(ownerTabId)
    const owner = tabsForMini.find((tab) => tab.id === ownerTabId)
    if (owner?.entries[owner.index] !== `/watch/${videoId}`) navigatorFor(ownerTabId).push(`/watch/${videoId}`)
  }
  const sendPlayerCommand = (detail: PlayerCommandDetail) => window.dispatchEvent(new CustomEvent<PlayerCommandDetail>(PLAYER_COMMAND_EVENT, { detail: { ...detail, tabId: ownerTabId } }))
  const location = useLocation()
  const [isMinimized, setIsMinimized] = useState(false)
  const [isMinimizePreview, setIsMinimizePreview] = useState(false)
  const [isRestorePreview, setIsRestorePreview] = useState(false)
  const [isDragPointerActive, setIsDragPointerActive] = useState(false)
  const [miniPosition, setMiniPosition] = useState<{ x: number; y: number } | null>(null)
  const [playerState, setPlayerState] = useState<PlayerStateDetail>({ paused: true, currentTime: 0, duration: 0, volume: 1 })
  const miniRef = useRef<HTMLDivElement | null>(null)
  const minimizedBarRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    width: number
    height: number
    moved: boolean
  } | null>(null)
  const restoreDragRef = useRef<{
    startX: number
    startY: number
    baseX: number
    baseY: number
    width: number
    height: number
    moved: boolean
  } | null>(null)
  const lastDragEndAtRef = useRef(Number.NEGATIVE_INFINITY)
  const isWatchRoute = activeId === ownerTabId && location.pathname === `/watch/${videoId}`

  useEffect(() => {
    setIsMinimized(false)
    setIsMinimizePreview(false)
    setIsRestorePreview(false)
    setIsDragPointerActive(false)
    setMiniPosition(null)
  }, [videoId])

  useEffect(() => {
    if (!isDragPointerActive) return
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'grabbing'
    return () => {
      document.body.style.cursor = previousCursor
    }
  }, [isDragPointerActive])

  useEffect(() => {
    const handlePlayerState = (event: Event) => {
      const detail = (event as CustomEvent<PlayerStateDetail>).detail
      if (detail.tabId === ownerTabId) setPlayerState(detail)
    }

    window.addEventListener(PLAYER_STATE_EVENT, handlePlayerState)
    sendPlayerCommand({ action: 'sync' })
    return () => window.removeEventListener(PLAYER_STATE_EVENT, handlePlayerState)
  }, [videoId, ownerTabId])

  function handleDraggedClickCapture(event: ReactMouseEvent<HTMLElement>) {
    if (performance.now() - lastDragEndAtRef.current > 250) return
    event.preventDefault()
    event.stopPropagation()
  }

  function handleTimelineChange(event: ChangeEvent<HTMLInputElement>) {
    const seconds = Number(event.currentTarget.value)
    if (!Number.isFinite(seconds)) return
    sendPlayerCommand({ action: 'seek-to', seconds })
  }

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const volume = Number(event.currentTarget.value)
    if (!Number.isFinite(volume)) return
    sendPlayerCommand({ action: 'set-volume', volume })
  }

  function handleDragStart(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return
    if (isRangeControlTarget(event.target)) return
    const rect = miniRef.current?.getBoundingClientRect()
    if (!rect) return
    setIsDragPointerActive(true)
    setIsMinimizePreview(false)
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      moved: false
    }

    const handleWindowMove = (moveEvent: PointerEvent) => handleDragMove(moveEvent)
    const handleWindowEnd = (endEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handleWindowMove)
      window.removeEventListener('pointerup', handleWindowEnd)
      window.removeEventListener('pointercancel', handleWindowEnd)
      handleDragEnd(endEvent)
    }

    window.addEventListener('pointermove', handleWindowMove)
    window.addEventListener('pointerup', handleWindowEnd)
    window.addEventListener('pointercancel', handleWindowEnd)
  }

  function handleDragMove(event: PointerEvent) {
    const drag = dragRef.current
    if (!drag) return

    drag.moved = drag.moved || Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3
    if (!drag.moved) return
    event.preventDefault()
    const minX = 12
    const maxX = Math.max(minX, window.innerWidth - drag.width - 12)
    const maxY = Math.max(12, window.innerHeight - drag.height - 12)
    const nextTop = clampNumber(event.clientY - drag.offsetY, 12, maxY)
    setMiniPosition({
      x: clampNumber(event.clientX - drag.offsetX, minX, maxX),
      y: nextTop
    })
    setIsMinimizePreview(isMinimizeGesture(event, drag))
  }

  function handleDragEnd(event: PointerEvent) {
    const drag = dragRef.current
    dragRef.current = null
    setIsDragPointerActive(false)
    if (!drag?.moved) {
      setIsMinimizePreview(false)
      return
    }
    lastDragEndAtRef.current = performance.now()
    if (isMinimizeGesture(event, drag)) {
      setIsMinimized(true)
      setMiniPosition(null)
    }
    setIsMinimizePreview(false)
  }

  function handleRestoreDragStart(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return
    if (isRangeControlTarget(event.target)) return
    setIsDragPointerActive(true)
    const width = window.innerWidth <= 680 ? window.innerWidth - 24 : Math.min(480, window.innerWidth - 40)
    const height = width * 9 / 16 + 52
    const minX = 12
    const maxX = Math.max(minX, window.innerWidth - width - 12)
    const maxY = Math.max(12, window.innerHeight - height - 12)
    restoreDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: clampNumber(event.clientX - width / 2, minX, maxX),
      baseY: maxY,
      width,
      height,
      moved: false
    }
    setIsRestorePreview(false)

    const handleWindowMove = (moveEvent: PointerEvent) => handleRestoreDragMove(moveEvent)
    const handleWindowEnd = (endEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handleWindowMove)
      window.removeEventListener('pointerup', handleWindowEnd)
      window.removeEventListener('pointercancel', handleWindowEnd)
      handleRestoreDragEnd(endEvent)
    }

    window.addEventListener('pointermove', handleWindowMove)
    window.addEventListener('pointerup', handleWindowEnd)
    window.addEventListener('pointercancel', handleWindowEnd)
  }

  function handleRestoreDragMove(event: PointerEvent) {
    const drag = restoreDragRef.current
    if (!drag) return
    drag.moved = drag.moved || Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3
    if (!drag.moved) return
    event.preventDefault()

    const minX = 12
    const maxX = Math.max(minX, window.innerWidth - drag.width - 12)
    const maxY = Math.max(12, window.innerHeight - drag.height - 12)
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY

    setMiniPosition({
      x: clampNumber(drag.baseX + deltaX, minX, maxX),
      y: clampNumber(drag.baseY + deltaY, 12, maxY)
    })
    setIsRestorePreview(true)
  }

  function handleRestoreDragEnd(event: PointerEvent) {
    const drag = restoreDragRef.current
    restoreDragRef.current = null
    setIsDragPointerActive(false)
    if (!drag?.moved) {
      setIsRestorePreview(false)
      return
    }
    lastDragEndAtRef.current = performance.now()

    const minX = 12
    const maxX = Math.max(minX, window.innerWidth - drag.width - 12)
    const maxY = Math.max(12, window.innerHeight - drag.height - 12)
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY

    setMiniPosition({
      x: clampNumber(drag.baseX + deltaX, minX, maxX),
      y: clampNumber(drag.baseY + deltaY, 12, maxY)
    })
    setIsMinimized(false)
    setIsMinimizePreview(false)
    setIsRestorePreview(false)
  }

  useEffect(() => {
    const miniSurface = miniRef.current
    const minimizedSurface = minimizedBarRef.current
    if (!miniSurface && !minimizedSurface) return

    // The video is portaled into the mini slot, so listen on the real DOM
    // surface to receive pointer events from the video as well as its header.
    const handleMiniPointerDown = (event: PointerEvent) => handleDragStart(event)
    const handleMinimizedPointerDown = (event: PointerEvent) => handleRestoreDragStart(event)
    miniSurface?.addEventListener('pointerdown', handleMiniPointerDown)
    minimizedSurface?.addEventListener('pointerdown', handleMinimizedPointerDown)

    return () => {
      miniSurface?.removeEventListener('pointerdown', handleMiniPointerDown)
      minimizedSurface?.removeEventListener('pointerdown', handleMinimizedPointerDown)
    }
  }, [videoId, isMinimized, isWatchRoute, shorts.length, activeId, ownerTabId])

  if (videoId === null || playbackMode === 'music' || activeId !== ownerTabId || isWatchRoute || shorts.length > 0) return null

  const showBar = (isMinimized || isMinimizePreview) && !isRestorePreview
  const hideMini = (isMinimized || isMinimizePreview) && !isRestorePreview
  const dragCursorClass = isDragPointerActive
    ? 'cursor-grabbing [&_[role=button]]:cursor-grabbing [&_button]:cursor-grabbing'
    : 'cursor-grab [&_[role=button]]:cursor-pointer [&_button]:cursor-pointer'
  const hasTimeline = Number.isFinite(playerState.duration) && playerState.duration > 0
  const timelineValue = hasTimeline ? clampNumber(playerState.currentTime, 0, playerState.duration) : 0
  const volumeValue = clampNumber(playerState.volume, 0, 1)
  const timelineRangeStyle = { '--wt-range-progress': `${hasTimeline ? (timelineValue / playerState.duration) * 100 : 0}%` } as CSSProperties
  const volumeRangeStyle = { '--wt-range-progress': `${volumeValue * 100}%` } as CSSProperties

  return (
    <>
      {showBar && (
      <aside
        ref={minimizedBarRef}
        onClickCapture={handleDraggedClickCapture}
        className={[
          'fixed bottom-0 right-0 z-50 touch-none select-none border-t border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40 transition-opacity max-[680px]:bottom-[60px] max-[680px]:left-0',
          dragCursorClass,
          isMinimizePreview && !isMinimized ? 'pointer-events-none opacity-45' : 'opacity-100',
          isSideNavOpen ? 'min-[681px]:left-[200px]' : 'min-[681px]:left-20'
        ].join(' ')}
      >
        <div className="grid min-h-[58px] min-w-0 grid-cols-[minmax(120px,1fr)_minmax(220px,520px)_auto] items-center gap-4 px-4 max-[840px]:grid-cols-[minmax(0,1fr)_auto]">
          <button
            type="button"
            onClick={returnToWatch}
            className="min-w-0 cursor-pointer text-left"
            data-player-control="true"
          >
            <span className="block truncate text-sm font-medium">{title}</span>
            <span className="block truncate text-xs text-neutral-400">{channelName}</span>
          </button>
          <div className="flex min-w-0 items-center justify-center gap-2 max-[840px]:hidden" data-player-control="true">
            <span className="w-11 text-right text-xs tabular-nums text-neutral-500">{formatMediaTime(playerState.currentTime)}</span>
            <input
              type="range"
              min={0}
              max={hasTimeline ? playerState.duration : 0}
              step={0.1}
              value={timelineValue}
              onChange={handleTimelineChange}
              disabled={!hasTimeline}
              aria-label={t("Buscar en reproducción")}
              className="wt-media-range min-w-0 flex-1 cursor-pointer disabled:cursor-default disabled:opacity-50"
              style={timelineRangeStyle}
            />
            <span className="w-11 text-xs tabular-nums text-neutral-500">{formatMediaTime(playerState.duration)}</span>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => sendPlayerCommand({ action: 'seek-relative', seconds: -10 })}
              aria-label={t("Retroceder 10 segundos")}
              title={t("Retroceder 10 segundos")}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              data-player-control="true"
            >
              <Icon name="replay10" className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => sendPlayerCommand({ action: 'toggle-play' })}
              aria-label={playerState.paused ? t("Reproducir") : t("Pausar")}
              title={playerState.paused ? t("Reproducir") : t("Pausar")}
              className="wt-action grid h-9 w-9 cursor-pointer place-items-center rounded"
              data-player-control="true"
            >
              <Icon name={playerState.paused ? 'play' : 'pause'} className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => sendPlayerCommand({ action: 'seek-relative', seconds: 10 })}
              aria-label={t('Avanzar 10 segundos')}
              title={t('Avanzar 10 segundos')}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              data-player-control="true"
            >
              <Icon name="forward10" className="h-5 w-5" />
            </button>
            <div className="ml-2 flex w-28 items-center gap-2 max-[980px]:hidden" data-player-control="true">
              <Icon name="volume" className="h-4 w-4 text-neutral-500" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volumeValue}
                onChange={handleVolumeChange}
                aria-label={t("Volumen")}
                className="wt-media-range min-w-0 flex-1 cursor-pointer"
                style={volumeRangeStyle}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setIsMinimized(false)
                setIsMinimizePreview(false)
                setIsRestorePreview(false)
                setMiniPosition(null)
              }}
              aria-label={t("Restaurar mini reproductor")}
              title={t("Restaurar mini reproductor")}
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              data-player-control="true"
            >
              <Icon name="arrowUpRight" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closePlayer}
              aria-label={t("Cerrar reproductor")}
              title={t("Cerrar reproductor")}
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              data-player-control="true"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      )}

      <div
        ref={miniRef}
        aria-hidden={hideMini}
        className={[
          'fixed z-50 w-[min(480px,calc(100vw-40px))] max-[680px]:w-[calc(100vw-24px)]',
          hideMini
            ? 'pointer-events-none -left-[9999px] top-0 opacity-0'
            : miniPosition
              ? ''
              : 'bottom-5 right-5 max-[680px]:bottom-[72px] max-[680px]:right-3'
        ].join(' ')}
        style={!hideMini && miniPosition ? { left: miniPosition.x, top: miniPosition.y } : undefined}
      >
        <aside
          onClickCapture={handleDraggedClickCapture}
          className={[
            'grid touch-none select-none grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-lg border bg-neutral-900 shadow-2xl shadow-black/40 transition-opacity',
            dragCursorClass,
            isMinimizePreview ? 'border-neutral-100/60 opacity-35 ring-2 ring-neutral-100/20' : 'border-neutral-800 opacity-100'
          ].join(' ')}
        >
          <button
            type="button"
            onClick={returnToWatch}
            className="min-w-0 cursor-pointer px-3 py-2 text-left"
            data-player-control="true"
          >
            <span className="block truncate text-sm font-medium">{title}</span>
            <span className="block truncate text-xs text-neutral-400">{channelName}</span>
          </button>
          <div className="flex items-center pr-2">
            <button
              type="button"
              onClick={() => sendPlayerCommand({ action: 'toggle-picture-in-picture' })}
              aria-label={t("Imagen en imagen")}
              title={t("Imagen en imagen")}
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              data-player-control="true"
            >
              <Icon name="pictureInPicture" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsMinimized(true)
                setIsMinimizePreview(false)
                setIsRestorePreview(false)
                setMiniPosition(null)
              }}
              aria-label={t("Minimizar reproductor")}
              title={t("Minimizar reproductor")}
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              data-player-control="true"
            >
              <Icon name="arrowDownRight" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closePlayer}
              aria-label={t("Cerrar reproductor")}
              title={t("Cerrar reproductor")}
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              data-player-control="true"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
          <div id={`${MINI_SLOT_ID}-${ownerTabId}`} className="col-span-2 aspect-video w-full bg-black" />
        </aside>
      </div>
    </>
  )
}

function AppRoutes() {
  useLocale()
  const location = useLocation()
  const { revision } = usePageTab()
  return (
    <ErrorBoundary key={`${location.pathname}:${revision}`}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/history" element={<History />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/music" element={<Music />} />
        <Route path="/profile" element={<Navigate to="/saved" replace />} />
        <Route path="/account" element={<Account />} />
        <Route path="/channel/:channelId" element={<Channel />} />
        <Route path="/collection/:kind/:collectionId" element={<Collection />} />
        <Route path="/watch/:videoId" element={<Watch />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  useLocale()
  const isSideNavOpen = false

  return (
    <ProfileProvider>
      <PlayerWorkspaceProvider>
        <TabLinkHandler><div className="min-h-screen bg-neutral-950 text-neutral-100">
          <TopNav />
          <div className="flex min-h-[calc(100vh-60px)] max-[680px]:block max-[680px]:pb-[72px] max-[680px]:pt-[60px]">
            <SideNav isOpen={isSideNavOpen} />
            <main className="min-w-0 flex-1">
              <PlayerTabBar />
              <div className="p-4 max-[680px]:p-3"><TabPages><TabPlayer /></TabPages></div>
            </main>
          </div>
          <MiniPlayer isSideNavOpen={isSideNavOpen} />
          <MusicMiniPlayer />
          <ShortsModal />
          <UpdateNotice />
        </div></TabLinkHandler>
      </PlayerWorkspaceProvider>
    </ProfileProvider>
  )
}

function PlayerTabBar() {
  useLocale()
  const { playingIds } = usePlayerWorkspace()
  return <TabBar playingIds={playingIds} />
}

function TabPlayer() {
  useLocale()
  const { id } = usePageTab()
  const { requestPlayback } = usePlayerWorkspace()
  const startShort = useCallback(() => requestPlayback(id), [requestPlayback, id])
  return <GlobalPlayerProvider tabId={id} onOpenShort={startShort}>
    <RegisterTabPlayer />
    <AppRoutes />
    <TabPlayerMedia />
  </GlobalPlayerProvider>
}

function TabPlayerMedia() {
  useLocale()
  const { videoId } = useGlobalPlayer()
  return videoId ? <GlobalPlayerHost /> : null
}
