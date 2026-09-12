import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { GlobalPlayerProvider, useGlobalPlayer } from './player/GlobalPlayerContext'
import { GlobalPlayerHost, MINI_SLOT_ID } from './player/GlobalPlayerHost'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Channel } from './pages/Channel'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { Search } from './pages/Search'
import { Subscriptions } from './pages/Subscriptions'
import { Watch } from './pages/Watch'
import type { Subscription } from '../../shared/ipc'

type IconName = 'back' | 'forward' | 'history' | 'home' | 'menu' | 'rss' | 'search' | 'x'

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, JSX.Element> = {
    back: <path d="M15 6 9 12l6 6M10 12h11" />,
    forward: <path d="m9 6 6 6-6 6M14 12H3" />,
    history: <path d="M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />,
    home: <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    rss: <path d="M5 5a14 14 0 0 1 14 14M5 12a7 7 0 0 1 7 7M5 19h.01" />,
    search: <path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4z" />,
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

        <div className="flex justify-end">
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

  useEffect(() => {
    let cancelled = false
    window.api.listSubscriptions().then((items) => {
      if (!cancelled) setSubscriptions(items.slice(0, 10))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <nav
      aria-label="Secciones"
      className={[
        'sticky top-[60px] z-30 h-[calc(100vh-60px)] shrink-0 overflow-hidden border-r border-neutral-800 bg-neutral-900 transition-[width] duration-150 ease-in-out max-[680px]:fixed max-[680px]:inset-x-0 max-[680px]:bottom-0 max-[680px]:top-auto max-[680px]:h-[60px] max-[680px]:w-full max-[680px]:border-r-0 max-[680px]:border-t',
        isOpen ? 'w-[200px]' : 'w-20'
      ].join(' ')}
    >
      <div className="h-full overflow-y-auto overflow-x-hidden py-3 max-[680px]:flex max-[680px]:items-stretch max-[680px]:overflow-hidden max-[680px]:py-0">
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
      </div>
    </nav>
  )
}

function MiniPlayer() {
  const { videoId, title, channelName, closePlayer } = useGlobalPlayer()
  const location = useLocation()
  const isWatchRoute = location.pathname.startsWith('/watch/')

  if (videoId === null || isWatchRoute) return null

  return (
    <aside className="fixed bottom-5 right-5 z-50 grid w-[min(420px,calc(100vw-40px))] grid-cols-[1fr_auto] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/40 max-[680px]:bottom-[72px] max-[680px]:right-3 max-[680px]:w-[calc(100vw-24px)]">
      <div className="flex min-w-0 items-center px-3 py-2">
        <Link to={`/watch/${videoId}`} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-neutral-400">{channelName}</p>
        </Link>
      </div>
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
        <Route path="/channel/:channelId" element={<Channel />} />
        <Route path="/watch/:videoId" element={<Watch />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default function App() {
  const [isSideNavOpen, setIsSideNavOpen] = useState(false)

  return (
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
        <MiniPlayer />
      </div>
    </GlobalPlayerProvider>
  )
}
