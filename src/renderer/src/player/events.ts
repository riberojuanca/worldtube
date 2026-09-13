export const PLAYER_SEEK_EVENT = 'worldtube:player-seek'
export const PLAYER_COMMAND_EVENT = 'worldtube:player-command'
export const PLAYER_STATE_EVENT = 'worldtube:player-state'

export type PlayerCommandDetail =
  | { action: 'sync' }
  | { action: 'toggle-play' }
  | { action: 'seek-relative'; seconds: number }
  | { action: 'seek-to'; seconds: number }
  | { action: 'set-volume'; volume: number }

export interface PlayerStateDetail {
  paused: boolean
  currentTime: number
  duration: number
  volume: number
}
