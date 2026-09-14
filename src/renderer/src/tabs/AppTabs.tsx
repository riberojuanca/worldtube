import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { NavigationType, Router, createPath, parsePath, UNSAFE_LocationContext, UNSAFE_NavigationContext, type Navigator, type To } from 'react-router-dom'

interface Tab {
  id: string
  entries: string[]
  index: number
  title: string
  scroll: number
}
interface TabsValue {
  tabs: Tab[]
  activeId: string
  open: (path?: string, background?: boolean) => void
  select: (id: string) => void
  close: (id: string) => void
  rename: (id: string, title: string) => void
  reorder: (from: string, to: string) => void
  navigatorFor: (id: string) => Navigator
}
const TabsContext = createContext<TabsValue | null>(null)
const PageTabContext = createContext({ id: '', active: true })
const makeTab = (path = '/'): Tab => ({ id: crypto.randomUUID(), entries: [path], index: 0, title: 'Inicio', scroll: 0 })
const pathFor = (to: To) => typeof to === 'string' ? to : createPath(to)

export function useAppTabs() {
  const value = useContext(TabsContext)
  if (!value) throw new Error('AppTabsProvider missing')
  return value
}
export const usePageTab = () => useContext(PageTabContext)

export function AppTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>(() => [makeTab(window.location.hash.slice(1) || '/')])
  const [activeId, setActiveId] = useState(() => tabs[0].id)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const scrolls = useRef(new Map<string, number>())
  const previousId = useRef(activeId)
  const active = tabs.find((tab) => tab.id === activeId) || tabs[0]
  const path = active.entries[active.index]
  const rename = useCallback((id: string, title: string) => setTabs((items) => {
    if (!items.some((tab) => tab.id === id && tab.title !== title)) return items
    return items.map((tab) => tab.id === id ? { ...tab, title } : tab)
  }), [])

  const value = useMemo<TabsValue>(() => {
    const navigatorFor = (id: string): Navigator => ({
      createHref: (to) => `#${pathFor(to)}`,
      go: (delta) => setTabs((items) => items.map((tab) => tab.id === id
        ? { ...tab, index: Math.max(0, Math.min(tab.entries.length - 1, tab.index + delta)) } : tab)),
      push: (to) => setTabs((items) => items.map((tab) => tab.id === id
        ? { ...tab, entries: [...tab.entries.slice(0, tab.index + 1), pathFor(to)], index: tab.index + 1 } : tab)),
      replace: (to) => setTabs((items) => items.map((tab) => tab.id === id
        ? { ...tab, entries: tab.entries.map((entry, index) => index === tab.index ? pathFor(to) : entry) } : tab))
    })
    return {
      tabs, activeId,
      navigatorFor,
      open: (nextPath = '/', background = false) => {
        const tab = makeTab(nextPath)
        setTabs((items) => [...items, tab])
        if (!background) {
          scrolls.current.set(activeId, window.scrollY)
          setActiveId(tab.id)
        }
      },
      select: (id) => {
        scrolls.current.set(activeId, window.scrollY)
        setActiveId(id)
      },
      reorder: (from, to) => setTabs((items) => {
        const source = items.findIndex((tab) => tab.id === from)
        const destination = items.findIndex((tab) => tab.id === to)
        if (source < 0 || destination < 0 || source === destination) return items
        const next = [...items]
        const [tab] = next.splice(source, 1)
        next.splice(destination, 0, tab)
        return next
      }),
      close: (id) => {
        const items = tabsRef.current
        const index = items.findIndex((tab) => tab.id === id)
        if (index < 0) return
        const remaining = items.filter((tab) => tab.id !== id)
        if (!remaining.length) remaining.push(makeTab())
        setTabs(remaining)
        if (id === activeId) setActiveId(remaining[Math.min(index, remaining.length - 1)].id)
        scrolls.current.delete(id)
      },
      rename
    }
  }, [tabs, activeId, rename])

  useLayoutEffect(() => {
    window.history.replaceState(null, '', `#${path}`)
    if (previousId.current !== activeId) {
      window.scrollTo(0, scrolls.current.get(activeId) || 0)
      previousId.current = activeId
    }
  }, [activeId, path])

  useEffect(() => {
    const hashChange = () => {
      const next = window.location.hash.slice(1) || '/'
      if (next !== path) value.navigatorFor(activeId).push(next)
    }
    window.addEventListener('hashchange', hashChange)
    return () => window.removeEventListener('hashchange', hashChange)
  }, [activeId, path, value])

  return <TabsContext.Provider value={value}>
    <Router location={path} navigator={value.navigatorFor(activeId)}>{children}</Router>
  </TabsContext.Provider>
}

export function TabPages({ children }: { children: ReactNode }) {
  const { tabs, activeId, navigatorFor } = useAppTabs()
  const navigation = useContext(UNSAFE_NavigationContext)
  return <>{tabs.map((tab) => {
    const path = tab.entries[tab.index]
    const parsed = parsePath(path)
    return <div key={tab.id} hidden={tab.id !== activeId}>
      <PageTabContext.Provider value={{ id: tab.id, active: tab.id === activeId }}>
        <UNSAFE_NavigationContext.Provider value={{ ...navigation, navigator: navigatorFor(tab.id) }}>
          <UNSAFE_LocationContext.Provider value={{ location: { pathname: parsed.pathname || '/', search: parsed.search || '', hash: parsed.hash || '', state: null, key: `${tab.id}:${tab.index}` }, navigationType: NavigationType.Pop }}>
            {children}
          </UNSAFE_LocationContext.Provider>
        </UNSAFE_NavigationContext.Provider>
      </PageTabContext.Provider>
    </div>
  })}</>
}

function routeTitle(path: string) {
  if (path.startsWith('/search')) return new URLSearchParams(parsePath(path).search).get('q') || 'Buscar'
  const labels: Record<string, string> = { '/': 'Inicio', '/saved': 'Guardados', '/playlists': 'Playlists', '/account': 'Cuenta', '/history': 'Historial', '/subscriptions': 'Suscripciones' }
  return labels[path] || (path.startsWith('/channel') ? 'Canal' : 'Video')
}

export function TabBar({ playingIds = [] }: { playingIds?: string[] }) {
  const { tabs, activeId, open, select, close, reorder } = useAppTabs()
  return <div className="flex h-10 min-w-0 items-center border-b border-neutral-800 bg-neutral-950 px-2">
    <div role="tablist" aria-label="Pestañas" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const path = tab.entries[tab.index]
        const label = path.startsWith('/watch/') && tab.title !== 'Inicio' ? tab.title : routeTitle(path)
        return <div key={tab.id} draggable onDragStart={(event) => event.dataTransfer.setData('application/worldtube-tab', tab.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorder(event.dataTransfer.getData('application/worldtube-tab'), tab.id) }} className={`flex h-8 w-48 min-w-28 max-w-48 shrink-0 items-center rounded ${tab.id === activeId ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:bg-neutral-900'}`}>
          <button type="button" role="tab" aria-selected={tab.id === activeId} onClick={() => select(tab.id)} title={label} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 text-left text-xs">
            {playingIds.includes(tab.id) && <svg aria-label="Reproduciendo" className="h-3 w-3 shrink-0 text-green-400" viewBox="0 0 24 24" fill="currentColor"><path d="m7 4 14 8-14 8Z" /></svg>}
            <span className="truncate">{label}</span>
          </button>
          <button type="button" onClick={() => close(tab.id)} title="Cerrar pestaña" aria-label={`Cerrar ${label}`} className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded hover:bg-neutral-700"><svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        </div>
      })}
    </div>
    <button type="button" onClick={() => open()} title="Nueva pestaña" aria-label="Nueva pestaña" className="ml-1 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded text-xl text-neutral-400 hover:bg-neutral-800">+</button>
  </div>
}

export function TabLinkHandler({ children }: { children: ReactNode }) {
  const { open } = useAppTabs()
  function intercept(event: MouseEvent, middle = false) {
    if (middle ? event.button !== 1 : !event.ctrlKey && !event.metaKey) return
    const link = (event.target as Element).closest('a')
    const href = link?.getAttribute('href')
    if (!href?.startsWith('#/')) return
    event.preventDefault()
    event.stopPropagation()
    open(href.slice(1), !event.shiftKey)
  }
  return <div onClickCapture={intercept} onAuxClickCapture={(event) => intercept(event, true)}>{children}</div>
}
