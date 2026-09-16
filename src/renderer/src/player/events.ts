export const PLAYER_SEEK_EVENT = 'worldtube:player-seek'
export const PLAYER_COMMAND_EVENT = 'worldtube:player-command'
export const PLAYER_STATE_EVENT = 'worldtube:player-state'

export type PlayerCommandDetail = { tabId?: string } & (
  | { action: 'sync' }
  | { action: 'pause-others' }
  | { action: 'toggle-play' }
  | { action: 'toggle-picture-in-picture' }
  | { action: 'seek-relative'; seconds: number }
  | { action: 'seek-to'; seconds: number }
  | { action: 'set-volume'; volume: number })

export interface PlayerStateDetail {
  tabId?: string
  paused: boolean
  currentTime: number
  duration: number
  volume: number
}
