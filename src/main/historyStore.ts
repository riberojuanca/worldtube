import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { HistoryEntry } from '../shared/ipc'

const MAX_ENTRIES = 300

function storePath(): string {
  return join(app.getPath('userData'), 'history.json')
}

let cache: HistoryEntry[] | null = null
// Serializes writes so two overlapping saves can't interleave and corrupt the
// file (fetchVideoInfo for two videos resolving close together, for example).
let writeQueue: Promise<void> = Promise.resolve()

async function load(): Promise<HistoryEntry[]> {
  if (cache) return cache
  try {
    const raw = await readFile(storePath(), 'utf-8')
    cache = JSON.parse(raw) as HistoryEntry[]
  } catch {
    cache = []
  }
  return cache
}

async function persist(entries: HistoryEntry[]): Promise<void> {
  cache = entries
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(storePath()), { recursive: true })
    await writeFile(storePath(), JSON.stringify(entries), 'utf-8')
  })
  return writeQueue
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const entries = await load()
  return [...entries].sort((a, b) => b.watchedAt - a.watchedAt)
}

export async function recordHistoryEntry(entry: Omit<HistoryEntry, 'watchedAt'>): Promise<void> {
  const entries = await load()
  const withoutExisting = entries.filter((existing) => existing.videoId !== entry.videoId)
  withoutExisting.push({ ...entry, watchedAt: Date.now() })
  await persist(withoutExisting.slice(-MAX_ENTRIES))
}

export async function clearHistory(): Promise<void> {
  await persist([])
}
