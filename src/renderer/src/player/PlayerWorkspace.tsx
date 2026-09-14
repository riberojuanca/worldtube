import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAppTabs } from '../tabs/AppTabs'
import { GlobalPlayerContext, initialState, useGlobalPlayer, type GlobalPlayerContextValue } from './GlobalPlayerContext'
import { PLAYER_COMMAND_EVENT, PLAYER_STATE_EVENT, type PlayerStateDetail } from './events'

interface WorkspaceValue {
  register: (id: string, player: GlobalPlayerContextValue | null) => void
  ownerId: string
  playingIds: string[]
  requestPlayback: (id: string) => void
  shouldAutoplay: (id: string) => boolean
}
const WorkspaceContext = createContext<WorkspaceValue | null>(null)
const emptyPlayer: GlobalPlayerContextValue = {
  ...initialState, ownerTabId: '', shorts: [], playVideo: async () => {},
  closePlayer: () => {}, openShort: () => {}, dismissShorts: () => {}
}

export function usePlayerWorkspace() {
  const workspace = useContext(WorkspaceContext)
  if (!workspace) throw new Error('PlayerWorkspaceProvider missing')
  return workspace
}

export function PlayerWorkspaceProvider({ children }: { children: ReactNode }) {
  const { activeId, tabs } = useAppTabs()
  const [players, setPlayers] = useState<Record<string, GlobalPlayerContextValue>>({})
  const [preferredId, setPreferredId] = useState('')
  const [playingIds, setPlayingIds] = useState<string[]>([])
  const autoplayOwner = useRef('')
  const requestPlayback = useCallback((id: string) => {
    autoplayOwner.current = id
    window.dispatchEvent(new CustomEvent(PLAYER_COMMAND_EVENT, { detail: { action: 'pause-others', tabId: id } }))
  }, [])
  const shouldAutoplay = useCallback((id: string) => !autoplayOwner.current || autoplayOwner.current === id, [])
  const register = useCallback((id: string, player: GlobalPlayerContextValue | null) => {
    setPlayers((current) => {
      if (current[id] === player || (!player && !current[id])) return current
      const next = { ...current }
      if (player) next[id] = player
      else delete next[id]
      return next
    })
  }, [])
  const available = (id: string) => tabs.some((tab) => tab.id === id) && !!players[id]?.videoId
  const ownerId = available(activeId) ? activeId : available(preferredId) ? preferredId
    : [...tabs].reverse().find((tab) => available(tab.id))?.id || ''
  const selected = players[ownerId] || emptyPlayer

  useEffect(() => {
    if (players[activeId]?.videoId) setPreferredId(activeId)
  }, [activeId, players[activeId]?.videoId])

  useEffect(() => {
    const onState = (event: Event) => {
      const { tabId, paused } = (event as CustomEvent<PlayerStateDetail>).detail
      if (!tabId) return
      setPlayingIds((current) => {
        if (current.includes(tabId) === !paused) return current
        return paused ? current.filter((id) => id !== tabId) : [...current, tabId]
      })
    }
    window.addEventListener(PLAYER_STATE_EVENT, onState)
    return () => window.removeEventListener(PLAYER_STATE_EVENT, onState)
  }, [])

  const value = useMemo(() => ({ register, ownerId, playingIds, requestPlayback, shouldAutoplay }), [register, ownerId, playingIds, requestPlayback, shouldAutoplay])
  return <WorkspaceContext.Provider value={value}>
    <GlobalPlayerContext.Provider value={selected}>{children}</GlobalPlayerContext.Provider>
  </WorkspaceContext.Provider>
}

export function RegisterTabPlayer() {
  const player = useGlobalPlayer()
  const { register } = usePlayerWorkspace()
  useEffect(() => { register(player.ownerTabId, player) }, [register, player])
  useEffect(() => () => register(player.ownerTabId, null), [register, player.ownerTabId])
  return null
}
