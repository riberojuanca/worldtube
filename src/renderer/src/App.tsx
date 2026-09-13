import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { GlobalPlayerProvider, useGlobalPlayer } from './player/GlobalPlayerContext'
import { GlobalPlayerHost, MINI_SLOT_ID } from './player/GlobalPlayerHost'
import { PLAYER_COMMAND_EVENT, PLAYER_STATE_EVENT, type PlayerCommandDetail, type PlayerStateDetail } from './player/events'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProfileProvider, useProfiles } from './profiles/ProfileContext'
import { PROFILE_DATA_CHANGED_EVENT } from './profiles/events'
import { Channel } from './pages/Channel'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { Account } from './pages/Account'
import { Playlists } from './pages/Playlists'
import { Saved } from './pages/Saved'
import { Search } from './pages/Search'
import { Subscriptions } from './pages/Subscriptions'
import { Watch } from './pages/Watch'
import type { Subscription, UserProfile } from '../../shared/ipc'

type IconName =
  | 'arrowUpRight'
  | 'back'
  | 'bookmark'
  | 'database'
  | 'forward'
  | 'history'
  | 'home'
  | 'list'
  | 'menu'
  | 'pause'
  | 'play'
  | 'rewind'
  | 'rss'
  | 'search'
  | 'user'
  | 'x'

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, JSX.Element> = {
    arrowUpRight: <path d="M7 17 17 7M9 7h8v8" />,
    back: <path d="M15 6 9 12l6 6M10 12h11" />,
    bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />,
    database: <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />,
    forward: <path d="m9 6 6 6-6 6M14 12H3" />,
    history: <path d="M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />,
    home: <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    pause: <path d="M8 5v14M16 5v14" />,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    rewind: <path d="m11 19-8-7 8-7v14Zm10 0-8-7 8-7v14Z" />,
    rss: <path d="M5 5a14 14 0 0 1 14 14M5 12a7 7 0 0 1 7 7M5 19h.01" />,
    search: <path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4z" />,
    user: <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />,
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
  const { profiles, activeUser, activeProfile, activeProfileId, setActiveProfile, updateProfile, logoutLocalUser } = useProfiles()
  const [isOpen, setIsOpen] = useState(false)
  const [editProfileName, setEditProfileName] = useState(activeProfile.name)
  const [editProfileColor, setEditProfileColor] = useState(activeProfile.color)
  const [editProfileAvatar, setEditProfileAvatar] = useState<string | null>(activeProfile.avatarDataUrl)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      setMessage('Perfil guardado')
      setError(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    }
  }

  function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Elegí una imagen válida.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setEditProfileAvatar(typeof reader.result === 'string' ? reader.result : null)
      setError(null)
    }
    reader.onerror = () => setError('No se pudo leer la imagen.')
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
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-label="Perfiles"
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
                <p className="truncate text-xs text-neutral-500">Usuario local: {activeUser.name}</p>
              </div>
            </div>
            <input
              value={editProfileName}
              onChange={(event) => setEditProfileName(event.target.value)}
              aria-label="Nombre del perfil"
              className="h-9 rounded border border-neutral-700 bg-neutral-950 px-2 text-sm outline-none focus:border-neutral-500"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={editProfileColor}
                onChange={(event) => setEditProfileColor(event.target.value)}
                type="color"
                aria-label="Color del perfil"
                className="h-9 w-11 rounded border border-neutral-700 bg-neutral-950 p-1"
              />
              <label className="cursor-pointer rounded bg-neutral-800 px-2 py-2 text-sm text-neutral-100 hover:bg-neutral-700">
                Foto
                <input type="file" accept="image/*" onChange={handleAvatarFile} className="hidden" />
              </label>
              {editProfileAvatar && (
                <button type="button" onClick={() => setEditProfileAvatar(null)} className="rounded px-2 py-2 text-sm text-neutral-400 hover:bg-neutral-800">
                  Quitar
                </button>
              )}
              <button type="submit" className="ml-auto rounded bg-neutral-100 px-2 py-2 text-sm font-medium text-neutral-950 hover:bg-white">
                Guardar
              </button>
            </div>
            {(message || error) && <p className={['text-xs', error ? 'text-red-400' : 'text-neutral-400'].join(' ')}>{error ?? message}</p>}
          </form>
          <div className="grid gap-1">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleSelect(profile.id)}
                className={[
                  'flex min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-neutral-800',
                  profile.id === activeProfileId ? 'bg-neutral-800 text-white' : 'text-neutral-300'
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
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SearchBar() {
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const navigate = useNavigate()

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '')
  }, [searchParams])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus-within:border-neutral-500">
        <Icon name="search" className="h-4 w-4 shrink-0 text-neutral-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar / Ir a URL"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
    </form>
  )
}

function TopNav({ isSideNavOpen, onToggleSideNav }: { isSideNavOpen: boolean; onToggleSideNav: () => void }) {
  const navigate = useNavigate()
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-40 grid h-[60px] grid-cols-[auto_minmax(0,440px)_auto] items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-2 shadow-lg shadow-black/20 max-[680px]:fixed max-[680px]:inset-x-0 max-[680px]:top-0 max-[680px]:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleSideNav}
            aria-label={isSideNavOpen ? 'Contraer navegación' : 'Expandir navegación'}
            title={isSideNavOpen ? 'Contraer navegación' : 'Expandir navegación'}
            className="grid h-10 w-10 place-items-center rounded-full text-neutral-200 hover:bg-neutral-800 max-[680px]:hidden"
          >
            <Icon name="menu" />
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Volver"
            title="Volver"
            className="grid h-10 w-10 place-items-center rounded-full text-neutral-300 hover:bg-neutral-800 hover:text-white max-[680px]:hidden"
          >
            <Icon name="back" />
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            aria-label="Avanzar"
            title="Avanzar"
            className="grid h-10 w-10 place-items-center rounded-full text-neutral-300 hover:bg-neutral-800 hover:text-white max-[680px]:hidden"
          >
            <Icon name="forward" />
          </button>
          <Link
            to="/"
            className="ml-1 flex h-10 min-w-0 items-center gap-2 rounded px-3 text-lg font-semibold text-neutral-100 hover:bg-neutral-800"
            title="WorldTube"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-red-600 text-xs font-bold text-white">WT</span>
            <span className="truncate max-[680px]:hidden">WorldTube</span>
          </Link>
        </div>

        <div className="min-w-0 max-[680px]:hidden">
          <SearchBar />
        </div>

        <div className="flex justify-end gap-1">
          <ProfileMenu />
          <button
            type="button"
            onClick={() => setIsMobileSearchOpen((value) => !value)}
            aria-label="Buscar"
            title="Buscar"
            className="grid h-10 w-10 place-items-center rounded-full text-neutral-300 hover:bg-neutral-800 hover:text-white min-[681px]:hidden"
          >
            <Icon name="search" />
          </button>
          <Link
            to="/subscriptions"
            className="hidden rounded px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white sm:block"
          >
            Suscripciones
          </Link>
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
    isActive ? 'bg-neutral-800 text-white' : ''
  ].join(' ')
}

function SideNav({ isOpen }: { isOpen: boolean }) {
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
      aria-label="Secciones"
      className={[
        'sticky top-[60px] z-30 h-[calc(100vh-60px)] shrink-0 overflow-hidden border-r border-neutral-800 bg-neutral-900 transition-[width] duration-150 ease-in-out max-[680px]:fixed max-[680px]:inset-x-0 max-[680px]:bottom-0 max-[680px]:top-auto max-[680px]:h-[60px] max-[680px]:w-full max-[680px]:border-r-0 max-[680px]:border-t',
        isOpen ? 'w-[200px]' : 'w-20'
      ].join(' ')}
    >
      <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden py-3 max-[680px]:flex-row max-[680px]:items-stretch max-[680px]:overflow-hidden max-[680px]:py-0">
        <NavLink to="/" className={({ isActive }) => navClass(isOpen, isActive)} title="Inicio">
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <Icon name="home" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>Inicio</span>
        </NavLink>
        <NavLink to="/subscriptions" className={({ isActive }) => navClass(isOpen, isActive)} title="Suscripciones">
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <Icon name="rss" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>Suscripciones</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => navClass(isOpen, isActive)} title="Historial">
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <Icon name="history" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>Historial</span>
        </NavLink>
        <NavLink to="/saved" className={({ isActive }) => navClass(isOpen, isActive)} title="Guardados">
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <Icon name="bookmark" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>Guardados</span>
        </NavLink>
        <NavLink to="/playlists" className={({ isActive }) => navClass(isOpen, isActive)} title="Playlists">
          <span className="grid h-9 w-9 shrink-0 place-items-center">
            <Icon name="list" />
          </span>
          <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>Playlists</span>
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
                  {channel.thumbnailUrl ? (
                    <img src={channel.thumbnailUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-800 text-xs font-semibold">
                      {channel.channelName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  {isOpen && <span className="truncate text-sm">{channel.channelName}</span>}
                </NavLink>
              ))}
            </div>
          </>
        )}
        <div className="mt-auto border-t border-neutral-800 pt-3 max-[680px]:mt-0 max-[680px]:flex-1 max-[680px]:border-t-0 max-[680px]:pt-0">
          <NavLink to="/account" className={({ isActive }) => navClass(isOpen, isActive)} title="Cuenta">
            <span className="grid h-9 w-9 shrink-0 place-items-center">
              <Icon name="database" />
            </span>
            <span className={isOpen ? 'text-sm max-[680px]:text-[11px]' : 'text-[11px]'}>Cuenta</span>
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

function sendPlayerCommand(detail: PlayerCommandDetail) {
  window.dispatchEvent(new CustomEvent<PlayerCommandDetail>(PLAYER_COMMAND_EVENT, { detail }))
}

function isMinimizeGesture(event: PointerEvent, startY: number): boolean {
  return event.clientY - startY > 90
}

function MiniPlayer({ isSideNavOpen }: { isSideNavOpen: boolean }) {
  const { videoId, title, channelName, closePlayer } = useGlobalPlayer()
  const location = useLocation()
  const navigate = useNavigate()
  const [isMinimized, setIsMinimized] = useState(false)
  const [isMinimizePreview, setIsMinimizePreview] = useState(false)
  const [isRestorePreview, setIsRestorePreview] = useState(false)
  const [miniPosition, setMiniPosition] = useState<{ x: number; y: number } | null>(null)
  const [playerState, setPlayerState] = useState<PlayerStateDetail>({ paused: true, currentTime: 0, duration: 0 })
  const miniRef = useRef<HTMLDivElement | null>(null)
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
  const isWatchRoute = location.pathname.startsWith('/watch/')

  useEffect(() => {
    setIsMinimized(false)
    setIsMinimizePreview(false)
    setIsRestorePreview(false)
    setMiniPosition(null)
  }, [videoId])

  useEffect(() => {
    const handlePlayerState = (event: Event) => {
      setPlayerState((event as CustomEvent<PlayerStateDetail>).detail)
    }

    window.addEventListener(PLAYER_STATE_EVENT, handlePlayerState)
    sendPlayerCommand({ action: 'sync' })
    return () => window.removeEventListener(PLAYER_STATE_EVENT, handlePlayerState)
  }, [videoId])

  function handleDragStart(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = miniRef.current?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
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
    const minX = 12
    const maxX = Math.max(minX, window.innerWidth - drag.width - 12)
    const maxY = Math.max(12, window.innerHeight - drag.height - 12)
    const nextTop = clampNumber(event.clientY - drag.offsetY, 12, maxY)
    setMiniPosition({
      x: clampNumber(event.clientX - drag.offsetX, minX, maxX),
      y: nextTop
    })
    setIsMinimizePreview(isMinimizeGesture(event, drag.startY))
  }

  function handleDragEnd(event: PointerEvent) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag?.moved) {
      setIsMinimizePreview(false)
      if (videoId) navigate(`/watch/${videoId}`)
      return
    }
    if (isMinimizeGesture(event, drag.startY)) {
      setIsMinimized(true)
      setMiniPosition(null)
    }
    setIsMinimizePreview(false)
  }

  function handleRestoreDragStart(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    const width = Math.min(420, window.innerWidth - 40)
    const height = window.innerWidth <= 640 ? 236 : 272
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
    if (!drag?.moved) {
      setIsRestorePreview(false)
      if (videoId) navigate(`/watch/${videoId}`)
      return
    }

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

  if (videoId === null || isWatchRoute) return null

  const showBar = (isMinimized || isMinimizePreview) && !isRestorePreview
  const hideMini = (isMinimized || isMinimizePreview) && !isRestorePreview

  return (
    <>
      {showBar && (
      <aside
        className={[
          'fixed bottom-0 right-0 z-50 border-t border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40 transition-opacity max-[680px]:bottom-[60px] max-[680px]:left-0',
          isMinimizePreview && !isMinimized ? 'pointer-events-none opacity-45' : 'opacity-100',
          isSideNavOpen ? 'min-[681px]:left-[200px]' : 'min-[681px]:left-20'
        ].join(' ')}
      >
        <div className="flex min-h-[52px] min-w-0 items-center gap-3 px-4">
          <button
            type="button"
            onPointerDown={handleRestoreDragStart}
            aria-label="Arrastrar para restaurar mini reproductor"
            title="Arrastrar para restaurar mini reproductor"
            className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 text-left active:cursor-grabbing"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-neutral-800 text-neutral-400">
              <Icon name="menu" className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className="block truncate text-xs text-neutral-400">{channelName}</span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => sendPlayerCommand({ action: 'seek-relative', seconds: -10 })}
              aria-label="Retroceder 10 segundos"
              title="Retroceder 10 segundos"
              className="grid h-9 w-9 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            >
              <Icon name="rewind" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => sendPlayerCommand({ action: 'toggle-play' })}
              aria-label={playerState.paused ? 'Reproducir' : 'Pausar'}
              title={playerState.paused ? 'Reproducir' : 'Pausar'}
              className="grid h-9 w-9 place-items-center rounded bg-neutral-100 text-neutral-950 hover:bg-white"
            >
              <Icon name={playerState.paused ? 'play' : 'pause'} className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => sendPlayerCommand({ action: 'seek-relative', seconds: 10 })}
              aria-label="Avanzar 10 segundos"
              title="Avanzar 10 segundos"
              className="grid h-9 w-9 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            >
              <Icon name="forward" className="h-4 w-4" />
            </button>
          </div>
          <p className="hidden min-w-[86px] text-right text-xs text-neutral-500 sm:block">
            {formatMediaTime(playerState.currentTime)} / {formatMediaTime(playerState.duration)}
          </p>
          <button
            type="button"
            onClick={() => {
              setIsMinimized(false)
              setIsMinimizePreview(false)
              setIsRestorePreview(false)
              setMiniPosition(null)
            }}
            aria-label="Restaurar mini reproductor"
            title="Restaurar mini reproductor"
            className="grid h-9 w-9 shrink-0 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Icon name="arrowUpRight" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={closePlayer}
            aria-label="Cerrar reproductor"
            title="Cerrar reproductor"
            className="grid h-9 w-9 shrink-0 place-items-center rounded text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      </aside>
      )}

      <div
        ref={miniRef}
        aria-hidden={hideMini}
        className={[
          'fixed z-50 w-[min(420px,calc(100vw-40px))] max-[680px]:w-[calc(100vw-24px)]',
          hideMini
            ? 'pointer-events-none -left-[9999px] top-0 opacity-0'
            : miniPosition
              ? ''
              : 'bottom-5 right-5 max-[680px]:bottom-[72px] max-[680px]:right-3'
        ].join(' ')}
        style={!hideMini && miniPosition ? { left: miniPosition.x, top: miniPosition.y } : undefined}
      >
        <aside
          className={[
            'grid grid-cols-[1fr_auto] overflow-hidden rounded-lg border bg-neutral-900 shadow-2xl shadow-black/40 transition-opacity',
            isMinimizePreview ? 'border-neutral-100/60 opacity-35 ring-2 ring-neutral-100/20' : 'border-neutral-800 opacity-100'
          ].join(' ')}
        >
          <button
            type="button"
            onPointerDown={handleDragStart}
            aria-label="Mover mini reproductor"
            title="Mover mini reproductor"
            className="flex min-w-0 cursor-grab touch-none items-center gap-2 px-3 py-2 text-left active:cursor-grabbing"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-neutral-800 text-neutral-400">
              <Icon name="menu" className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className="block truncate text-xs text-neutral-400">{channelName}</span>
            </span>
          </button>
          <div className="flex items-center pr-2">
            <button
              type="button"
              onClick={closePlayer}
              aria-label="Cerrar reproductor"
              title="Cerrar reproductor"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
          <div id={MINI_SLOT_ID} className="col-span-2 h-[236px] w-full bg-black max-[640px]:h-[200px]" />
        </aside>
      </div>
    </>
  )
}

function AppRoutes() {
  const location = useLocation()
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/history" element={<History />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/profile" element={<Navigate to="/saved" replace />} />
        <Route path="/account" element={<Account />} />
        <Route path="/channel/:channelId" element={<Channel />} />
        <Route path="/watch/:videoId" element={<Watch />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  const [isSideNavOpen, setIsSideNavOpen] = useState(false)

  return (
    <ProfileProvider>
      <GlobalPlayerProvider>
        <div className="min-h-screen bg-neutral-950 text-neutral-100">
          <TopNav isSideNavOpen={isSideNavOpen} onToggleSideNav={() => setIsSideNavOpen((value) => !value)} />
          <div className="flex min-h-[calc(100vh-60px)] max-[680px]:block max-[680px]:pb-[72px] max-[680px]:pt-[60px]">
            <SideNav isOpen={isSideNavOpen} />
            <main className="min-w-0 flex-1 p-4 max-[680px]:p-3">
              <AppRoutes />
            </main>
          </div>
          <GlobalPlayerHost />
          <MiniPlayer isSideNavOpen={isSideNavOpen} />
        </div>
      </GlobalPlayerProvider>
    </ProfileProvider>
  )
}
