import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Subscription } from '../shared/ipc'

function storePath(): string {
  return join(app.getPath('userData'), 'subscriptions.json')
}

let cache: Subscription[] | null = null
let writeQueue: Promise<void> = Promise.resolve()

async function load(): Promise<Subscription[]> {
  if (cache) return cache
  try {
    const raw = await readFile(storePath(), 'utf-8')
    cache = JSON.parse(raw) as Subscription[]
  } catch {
    cache = []
  }
  return cache
}

async function persist(entries: Subscription[]): Promise<void> {
  cache = entries
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(storePath()), { recursive: true })
    await writeFile(storePath(), JSON.stringify(entries), 'utf-8')
  })
  return writeQueue
}

export async function listSubscriptions(): Promise<Subscription[]> {
  const entries = await load()
  return [...entries].sort((a, b) => a.channelName.localeCompare(b.channelName))
}

export async function addSubscription(sub: Omit<Subscription, 'subscribedAt'>): Promise<void> {
  const entries = await load()
  if (entries.some((existing) => existing.channelId === sub.channelId)) return
  await persist([...entries, { ...sub, subscribedAt: Date.now() }])
}

export async function removeSubscription(channelId: string): Promise<void> {
  const entries = await load()
  await persist(entries.filter((existing) => existing.channelId !== channelId))
}
