import type { HistoryEntry } from '../shared/ipc'
import { clearActiveHistory, getActiveHistory, recordActiveHistoryEntry } from './localDb'

export async function getHistory(): Promise<HistoryEntry[]> {
  return getActiveHistory()
}

export async function recordHistoryEntry(entry: Omit<HistoryEntry, 'watchedAt'>): Promise<void> {
  return recordActiveHistoryEntry(entry)
}

export async function clearHistory(): Promise<void> {
  return clearActiveHistory()
}
