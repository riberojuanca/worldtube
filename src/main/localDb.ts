import { app } from 'electron'
import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  CreateLocalUserRequest,
  DeleteLocalUserRequest,
  CreateProfileRequest,
  CreateSavedPlaylistRequest,
  HistoryEntry,
  LocalSessionState,
  LocalUser,
  LoginLocalUserRequest,
  ProfilesState,
  SavedPlaylist,
  SavedVideo,
  SaveVideoRequest,
  SearchHistoryEntry,
  Subscription,
  UpdateProfileRequest,
  UserProfile
} from '../shared/ipc'

const DB_VERSION = 1
const MAX_HISTORY_ENTRIES = 300
const MAX_SEARCH_HISTORY_ENTRIES = 50
const PASSWORD_ITERATIONS = 210_000
const PROFILE_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#db2777', '#525252']

interface StoredUser extends LocalUser {
  passwordHash: string | null
  passwordSalt: string | null
  passwordIterations: number | null
}

interface LocalDb {
  version: 1
  session: {
    activeUserId: string | null
    activeProfileIdByUser: Record<string, string>
  }
  users: StoredUser[]
  profiles: UserProfile[]
  histories: Record<string, HistoryEntry[]>
  subscriptions: Record<string, Subscription[]>
  savedPlaylists: Record<string, SavedPlaylist[]>
  savedVideos: Record<string, SavedVideo[]>
  searchHistories: Record<string, SearchHistoryEntry[]>
  settings: Record<string, unknown>
}

function dbPath(): string {
  return join(app.getPath('userData'), 'worldtube-data.json')
}

function legacyProfilesPath(): string {
  return join(app.getPath('userData'), 'profiles.json')
}

function legacyProfileDataPath(profileId: string, fileName: string): string {
  return join(app.getPath('userData'), 'profiles', profileId, fileName)
}

function legacyGlobalDataPath(fileName: string): string {
  return join(app.getPath('userData'), fileName)
}

function now(): number {
  return Date.now()
}

function publicUser(user: StoredUser): LocalUser {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, passwordIterations: _passwordIterations, ...publicData } = user
  return publicData
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function normalizeColor(color: string | undefined, fallback: string): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
}

function getTextColor(color: string): string {
  const normalized = normalizeColor(color, PROFILE_COLORS[0])
  const red = parseInt(normalized.slice(1, 3), 16)
  const green = parseInt(normalized.slice(3, 5), 16)
  const blue = parseInt(normalized.slice(5, 7), 16)
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000
  return luminance > 145 ? '#111111' : '#ffffff'
}

function sortProfiles(profiles: UserProfile[]): UserProfile[] {
  return [...profiles].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}

function emptyDb(): LocalDb {
  return {
    version: DB_VERSION,
    session: { activeUserId: null, activeProfileIdByUser: {} },
    users: [],
    profiles: [],
    histories: {},
    subscriptions: {},
    savedPlaylists: {},
    savedVideos: {},
    searchHistories: {},
    settings: {}
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return null
  }
}

function hashPassword(password: string): { hash: string; salt: string; iterations: number } {
  const salt = randomBytes(16).toString('base64')
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, 'sha256').toString('base64')
  return { hash, salt, iterations: PASSWORD_ITERATIONS }
}

function verifyPassword(user: StoredUser, password: string | undefined): boolean {
  if (!user.passwordHash || !user.passwordSalt || !user.passwordIterations) return true
  if (!password) return false
  const hash = pbkdf2Sync(password, user.passwordSalt, user.passwordIterations, 32, 'sha256')
  return timingSafeEqual(Buffer.from(user.passwordHash, 'base64'), hash)
}

function createStoredUser(name: string, password: string | undefined, timestamp = now()): StoredUser {
  const cleanName = normalizeName(name)
  const passwordData = password ? hashPassword(password) : null
  return {
    id: `user-${randomUUID()}`,
    name: cleanName,
    hasPassword: Boolean(passwordData),
    passwordHash: passwordData?.hash ?? null,
    passwordSalt: passwordData?.salt ?? null,
    passwordIterations: passwordData?.iterations ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createProfile(userId: string, name: string, color: string, timestamp = now()): UserProfile {
  const normalizedColor = normalizeColor(color, PROFILE_COLORS[0])
  return {
    id: `profile-${randomUUID()}`,
    userId,
    name: normalizeName(name),
    color: normalizedColor,
    textColor: getTextColor(normalizedColor),
    avatarDataUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

async function migrateLegacyData(): Promise<LocalDb> {
  const db = emptyDb()
  const legacyProfiles = await readJson<{ activeProfileId?: string; profiles?: Array<Omit<UserProfile, 'userId'>> }>(legacyProfilesPath())
  const legacyHistory = await readJson<HistoryEntry[]>(legacyGlobalDataPath('history.json'))
  const legacySubscriptions = await readJson<Subscription[]>(legacyGlobalDataPath('subscriptions.json'))
  const hasLegacyData = Boolean(legacyProfiles?.profiles?.length || legacyHistory?.length || legacySubscriptions?.length)

  if (!hasLegacyData) return db

  const timestamp = now()
  const user = createStoredUser('Local', undefined, timestamp)
  db.users.push(user)
  db.session.activeUserId = user.id

  const profiles =
    legacyProfiles?.profiles?.map((profile) => {
      const color = normalizeColor(profile.color, PROFILE_COLORS[0])
      return {
        id: profile.id,
        userId: user.id,
        name: normalizeName(profile.name) || 'Personal',
        color,
        textColor: normalizeColor(profile.textColor, getTextColor(color)),
        avatarDataUrl: null,
        createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : timestamp,
        updatedAt: typeof profile.updatedAt === 'number' ? profile.updatedAt : timestamp
      }
    }) ?? [createProfile(user.id, 'Personal', PROFILE_COLORS[0], timestamp)]

  db.profiles = sortProfiles(profiles)
  const firstProfileId = db.profiles[0]?.id
  const activeProfileId =
    legacyProfiles?.activeProfileId && db.profiles.some((profile) => profile.id === legacyProfiles.activeProfileId)
      ? legacyProfiles.activeProfileId
      : firstProfileId

  if (activeProfileId) {
    db.session.activeProfileIdByUser[user.id] = activeProfileId
  }

  for (const profile of db.profiles) {
    db.histories[profile.id] =
      (await readJson<HistoryEntry[]>(legacyProfileDataPath(profile.id, 'history.json'))) ??
      (profile.id === activeProfileId ? legacyHistory ?? [] : [])
    db.subscriptions[profile.id] =
      (await readJson<Subscription[]>(legacyProfileDataPath(profile.id, 'subscriptions.json'))) ??
      (profile.id === activeProfileId ? legacySubscriptions ?? [] : [])
    db.searchHistories[profile.id] = []
  }

  return db
}

function normalizeDb(raw: unknown): LocalDb {
  if (typeof raw !== 'object' || raw === null) return emptyDb()
  const value = raw as Partial<LocalDb>
  const db = emptyDb()
  const timestamp = now()

  db.users = Array.isArray(value.users)
    ? value.users
        .filter((user): user is StoredUser => typeof user?.id === 'string' && typeof user.name === 'string')
        .map((user) => ({
          id: user.id,
          name: normalizeName(user.name) || 'Usuario',
          hasPassword: Boolean(user.passwordHash && user.passwordSalt && user.passwordIterations),
          passwordHash: typeof user.passwordHash === 'string' ? user.passwordHash : null,
          passwordSalt: typeof user.passwordSalt === 'string' ? user.passwordSalt : null,
          passwordIterations: typeof user.passwordIterations === 'number' ? user.passwordIterations : null,
          createdAt: typeof user.createdAt === 'number' ? user.createdAt : timestamp,
          updatedAt: typeof user.updatedAt === 'number' ? user.updatedAt : timestamp
        }))
    : []

  db.profiles = Array.isArray(value.profiles)
    ? sortProfiles(
        value.profiles
          .filter((profile): profile is UserProfile => {
            return typeof profile?.id === 'string' && typeof profile.userId === 'string' && typeof profile.name === 'string'
          })
          .filter((profile) => db.users.some((user) => user.id === profile.userId))
          .map((profile) => {
            const color = normalizeColor(profile.color, PROFILE_COLORS[0])
            return {
              id: profile.id,
              userId: profile.userId,
              name: normalizeName(profile.name) || 'Perfil',
              color,
              textColor: normalizeColor(profile.textColor, getTextColor(color)),
              avatarDataUrl: typeof profile.avatarDataUrl === 'string' ? profile.avatarDataUrl : null,
              createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : timestamp,
              updatedAt: typeof profile.updatedAt === 'number' ? profile.updatedAt : timestamp
            }
          })
      )
    : []

  db.histories = typeof value.histories === 'object' && value.histories !== null ? (value.histories as Record<string, HistoryEntry[]>) : {}
  db.subscriptions =
    typeof value.subscriptions === 'object' && value.subscriptions !== null ? (value.subscriptions as Record<string, Subscription[]>) : {}
  db.savedPlaylists =
    typeof value.savedPlaylists === 'object' && value.savedPlaylists !== null ? (value.savedPlaylists as Record<string, SavedPlaylist[]>) : {}
  db.savedVideos = typeof value.savedVideos === 'object' && value.savedVideos !== null ? (value.savedVideos as Record<string, SavedVideo[]>) : {}
  db.searchHistories =
    typeof value.searchHistories === 'object' && value.searchHistories !== null
      ? (value.searchHistories as Record<string, SearchHistoryEntry[]>)
      : {}
  db.settings = typeof value.settings === 'object' && value.settings !== null ? (value.settings as Record<string, unknown>) : {}

  const activeUserId =
    value.session?.activeUserId && db.users.some((user) => user.id === value.session?.activeUserId) ? value.session.activeUserId : null
  db.session.activeUserId = activeUserId
  db.session.activeProfileIdByUser =
    typeof value.session?.activeProfileIdByUser === 'object' && value.session.activeProfileIdByUser !== null
      ? value.session.activeProfileIdByUser
      : {}

  for (const user of db.users) {
    const userProfiles = db.profiles.filter((profile) => profile.userId === user.id)
    if (userProfiles.length === 0) {
      const profile = createProfile(user.id, 'Personal', PROFILE_COLORS[0], timestamp)
      db.profiles.push(profile)
      db.session.activeProfileIdByUser[user.id] = profile.id
      continue
    }

    const activeProfileId = db.session.activeProfileIdByUser[user.id]
    if (!activeProfileId || !userProfiles.some((profile) => profile.id === activeProfileId)) {
      db.session.activeProfileIdByUser[user.id] = userProfiles[0].id
    }
  }

  db.profiles = sortProfiles(db.profiles)
  return db
}

let cache: LocalDb | null = null
let writeQueue: Promise<void> = Promise.resolve()

async function loadDb(): Promise<LocalDb> {
  if (cache) return cache
  try {
    cache = normalizeDb(JSON.parse(await readFile(dbPath(), 'utf-8')))
  } catch {
    cache = await migrateLegacyData()
    await persistDb(cache)
  }
  return cache
}

async function persistDb(db: LocalDb): Promise<void> {
  cache = db
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(dbPath()), { recursive: true })
    await writeFile(dbPath(), JSON.stringify(db), 'utf-8')
  })
  return writeQueue
}

function getActiveUser(db: LocalDb): StoredUser | null {
  return db.users.find((user) => user.id === db.session.activeUserId) ?? null
}

function getProfilesForUser(db: LocalDb, userId: string | null): UserProfile[] {
  if (!userId) return []
  return sortProfiles(db.profiles.filter((profile) => profile.userId === userId))
}

function getActiveProfile(db: LocalDb, userId: string | null): UserProfile | null {
  const profiles = getProfilesForUser(db, userId)
  const activeProfileId = userId ? db.session.activeProfileIdByUser[userId] : null
  return profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null
}

function requireActiveProfile(db: LocalDb): UserProfile {
  const user = getActiveUser(db)
  const profile = getActiveProfile(db, user?.id ?? null)
  if (!user || !profile) throw new Error('No hay una sesion local activa.')
  return profile
}

function toSessionState(db: LocalDb): LocalSessionState {
  const activeUser = getActiveUser(db)
  const profiles = getProfilesForUser(db, activeUser?.id ?? null)
  const activeProfile = getActiveProfile(db, activeUser?.id ?? null)
  const activeProfileId = activeProfile?.id ?? null
  const profileIds = new Set(db.profiles.map((profile) => profile.id))
  const historyEntries = Object.entries(db.histories).reduce((total, [profileId, entries]) => {
    return profileIds.has(profileId) ? total + entries.length : total
  }, 0)
  const subscriptions = Object.entries(db.subscriptions).reduce((total, [profileId, entries]) => {
    return profileIds.has(profileId) ? total + entries.length : total
  }, 0)
  const savedPlaylists = Object.entries(db.savedPlaylists).reduce((total, [profileId, entries]) => {
    return profileIds.has(profileId) ? total + entries.length : total
  }, 0)
  const savedVideos = Object.entries(db.savedVideos).reduce((total, [profileId, entries]) => {
    return profileIds.has(profileId) ? total + entries.length : total
  }, 0)

  return {
    users: db.users.map(publicUser),
    activeUserId: activeUser?.id ?? null,
    activeUser: activeUser ? publicUser(activeUser) : null,
    profiles,
    activeProfileId: activeProfile?.id ?? null,
    activeProfile,
    setupRequired: db.users.length === 0,
    dataPath: dbPath(),
    storageVersion: db.version,
    stats: {
      users: db.users.length,
      profiles: db.profiles.length,
      activeHistoryEntries: activeProfileId ? (db.histories[activeProfileId] ?? []).length : 0,
      activeSubscriptions: activeProfileId ? (db.subscriptions[activeProfileId] ?? []).length : 0,
      activeSavedPlaylists: activeProfileId ? (db.savedPlaylists[activeProfileId] ?? []).length : 0,
      activeSavedVideos: activeProfileId ? (db.savedVideos[activeProfileId] ?? []).length : 0,
      historyEntries,
      subscriptions,
      savedPlaylists,
      savedVideos,
      settingsKeys: Object.keys(db.settings).length
    }
  }
}

function toProfilesState(db: LocalDb): ProfilesState {
  const state = toSessionState(db)
  if (!state.activeProfile || !state.activeProfileId) throw new Error('No hay un perfil activo.')
  return {
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    activeProfile: state.activeProfile
  }
}

export async function getPlayerAudioPreferences(): Promise<import('../shared/ipc').PlayerAudioPreferences> {
  const db = await loadDb()
  const audio = db.settings.playerAudio as { volume?: unknown; muted?: unknown } | undefined
  return { volume: typeof audio?.volume === 'number' && Number.isFinite(audio.volume) ? Math.min(1, Math.max(0, audio.volume)) : 1,
    muted: audio?.muted === true }
}

export async function setPlayerAudioPreferences(audio: import('../shared/ipc').PlayerAudioPreferences): Promise<void> {
  if (!Number.isFinite(audio.volume) || typeof audio.muted !== 'boolean') throw new Error('Volumen invalido')
  const db = await loadDb()
  db.settings.playerAudio = { volume: Math.min(1, Math.max(0, audio.volume)), muted: audio.muted }
  await persistDb(db)
}

export async function getSessionState(): Promise<LocalSessionState> {
  return toSessionState(await loadDb())
}

export async function createLocalUser(request: CreateLocalUserRequest): Promise<LocalSessionState> {
  const db = await loadDb()
  const name = normalizeName(request.name)
  if (!name) throw new Error('El nombre de usuario no puede estar vacio.')

  const user = createStoredUser(name, request.password?.trim() ? request.password : undefined)
  const profile = createProfile(user.id, 'Personal', PROFILE_COLORS[db.users.length % PROFILE_COLORS.length])
  db.users.push(user)
  db.profiles.push(profile)
  db.session.activeUserId = user.id
  db.session.activeProfileIdByUser[user.id] = profile.id
  await persistDb(db)
  return toSessionState(db)
}

export async function loginLocalUser(request: LoginLocalUserRequest): Promise<LocalSessionState> {
  const db = await loadDb()
  const user = db.users.find((entry) => entry.id === request.userId)
  if (!user) throw new Error('Usuario no encontrado.')
  if (!verifyPassword(user, request.password)) throw new Error('Contrasena incorrecta.')

  db.session.activeUserId = user.id
  const profile = getActiveProfile(db, user.id)
  if (profile) db.session.activeProfileIdByUser[user.id] = profile.id
  await persistDb(db)
  return toSessionState(db)
}

export async function logoutLocalUser(): Promise<LocalSessionState> {
  const db = await loadDb()
  db.session.activeUserId = null
  await persistDb(db)
  return toSessionState(db)
}

export async function deleteLocalUser(request: DeleteLocalUserRequest): Promise<LocalSessionState> {
  const db = await loadDb()
  const user = db.users.find((entry) => entry.id === request.userId)
  if (!user) throw new Error('Usuario no encontrado.')

  const profileIds = db.profiles.filter((profile) => profile.userId === user.id).map((profile) => profile.id)
  db.users = db.users.filter((entry) => entry.id !== user.id)
  db.profiles = db.profiles.filter((profile) => profile.userId !== user.id)
  delete db.session.activeProfileIdByUser[user.id]
  for (const profileId of profileIds) {
    delete db.histories[profileId]
    delete db.subscriptions[profileId]
    delete db.savedPlaylists[profileId]
    delete db.savedVideos[profileId]
    delete db.searchHistories[profileId]
  }

  if (db.session.activeUserId === user.id) {
    db.session.activeUserId = db.users[0]?.id ?? null
  }

  await persistDb(db)
  return toSessionState(db)
}

export async function getProfilesState(): Promise<ProfilesState> {
  return toProfilesState(await loadDb())
}

export async function getActiveProfileId(): Promise<string> {
  return requireActiveProfile(await loadDb()).id
}

export async function createUserProfile(request: CreateProfileRequest): Promise<ProfilesState> {
  const db = await loadDb()
  const user = getActiveUser(db)
  if (!user) throw new Error('No hay una sesion local activa.')
  const name = normalizeName(request.name)
  if (!name) throw new Error('El nombre del perfil no puede estar vacio.')

  const profile = createProfile(user.id, name, normalizeColor(request.color, PROFILE_COLORS[db.profiles.length % PROFILE_COLORS.length]))
  db.profiles.push(profile)
  db.session.activeProfileIdByUser[user.id] = profile.id
  await persistDb(db)
  return toProfilesState(db)
}

export async function updateUserProfile(request: UpdateProfileRequest): Promise<ProfilesState> {
  const db = await loadDb()
  const user = getActiveUser(db)
  const profile = db.profiles.find((entry) => entry.id === request.id && entry.userId === user?.id)
  if (!user || !profile) throw new Error('Perfil no encontrado.')

  const name = request.name === undefined ? profile.name : normalizeName(request.name)
  if (!name) throw new Error('El nombre del perfil no puede estar vacio.')
  const color = normalizeColor(request.color, profile.color)
  Object.assign(profile, {
    name,
    color,
    textColor: request.textColor ? normalizeColor(request.textColor, getTextColor(color)) : getTextColor(color),
    avatarDataUrl: request.avatarDataUrl === undefined ? profile.avatarDataUrl : request.avatarDataUrl,
    updatedAt: now()
  })
  await persistDb(db)
  return toProfilesState(db)
}

export async function setActiveUserProfile(profileId: string): Promise<ProfilesState> {
  const db = await loadDb()
  const user = getActiveUser(db)
  if (!user || !db.profiles.some((profile) => profile.id === profileId && profile.userId === user.id)) {
    throw new Error('Perfil no encontrado.')
  }
  db.session.activeProfileIdByUser[user.id] = profileId
  await persistDb(db)
  return toProfilesState(db)
}

export async function removeUserProfile(profileId: string): Promise<ProfilesState> {
  const db = await loadDb()
  const user = getActiveUser(db)
  if (!user) throw new Error('No hay una sesion local activa.')
  const profiles = getProfilesForUser(db, user.id)
  if (profiles.length <= 1) throw new Error('No se puede borrar el ultimo perfil del usuario.')
  const profile = profiles.find((entry) => entry.id === profileId)
  if (!profile) throw new Error('Perfil no encontrado.')

  db.profiles = db.profiles.filter((entry) => entry.id !== profileId)
  delete db.histories[profileId]
  delete db.subscriptions[profileId]
  delete db.savedPlaylists[profileId]
  delete db.savedVideos[profileId]
  delete db.searchHistories[profileId]
  if (db.session.activeProfileIdByUser[user.id] === profileId) {
    const nextProfile = getProfilesForUser(db, user.id)[0]
    if (nextProfile) db.session.activeProfileIdByUser[user.id] = nextProfile.id
  }
  await persistDb(db)
  return toProfilesState(db)
}

export async function getActiveHistory(): Promise<HistoryEntry[]> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  return [...(db.histories[profile.id] ?? [])].sort((a, b) => b.watchedAt - a.watchedAt)
}

export async function recordActiveHistoryEntry(entry: Omit<HistoryEntry, 'watchedAt'>): Promise<void> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  const entries = db.histories[profile.id] ?? []
  const withoutExisting = entries.filter((existing) => existing.videoId !== entry.videoId)
  withoutExisting.push({ ...entry, watchedAt: now() })
  db.histories[profile.id] = withoutExisting.slice(-MAX_HISTORY_ENTRIES)
  await persistDb(db)
}

export async function clearActiveHistory(): Promise<void> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  db.histories[profile.id] = []
  await persistDb(db)
}

export async function listActiveSavedPlaylists(): Promise<SavedPlaylist[]> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  return [...(db.savedPlaylists[profile.id] ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function createActiveSavedPlaylist(request: CreateSavedPlaylistRequest): Promise<SavedPlaylist> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  const name = normalizeName(request.name)
  if (!name) throw new Error('El nombre de la playlist no puede estar vacio.')

  const entries = db.savedPlaylists[profile.id] ?? []
  const existing = entries.find((playlist) => playlist.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)
  if (existing) return existing

  const timestamp = now()
  const playlist: SavedPlaylist = {
    id: `playlist-${randomUUID()}`,
    profileId: profile.id,
    name,
    description: request.description?.trim() || null,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  db.savedPlaylists[profile.id] = [playlist, ...entries]
  await persistDb(db)
  return playlist
}

export async function listActiveSavedVideos(playlistId?: string | null): Promise<SavedVideo[]> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  const entries = db.savedVideos[profile.id] ?? []
  const filtered = playlistId === undefined ? entries : entries.filter((video) => (video.playlistId ?? null) === playlistId)
  return [...filtered].sort((a, b) => b.savedAt - a.savedAt)
}

export async function saveActiveVideo(request: SaveVideoRequest): Promise<SavedVideo> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  const title = normalizeName(request.title)
  if (!request.videoId || !title) throw new Error('No se puede guardar un video sin titulo.')

  const playlistId = request.playlistId ?? null
  if (playlistId && !(db.savedPlaylists[profile.id] ?? []).some((playlist) => playlist.id === playlistId)) {
    throw new Error('Playlist no encontrada.')
  }

  const entries = db.savedVideos[profile.id] ?? []
  const existing = entries.find((video) => video.videoId === request.videoId && (video.playlistId ?? null) === playlistId)
  const timestamp = now()
  const savedVideo: SavedVideo = {
    id: existing?.id ?? `saved-video-${randomUUID()}`,
    profileId: profile.id,
    videoId: request.videoId,
    title,
    channelId: request.channelId,
    channelName: normalizeName(request.channelName) || '(desconocido)',
    thumbnailUrl: request.thumbnailUrl,
    playlistId,
    savedAt: timestamp
  }

  db.savedVideos[profile.id] = [...entries.filter((video) => video.id !== savedVideo.id), savedVideo]

  if (playlistId) {
    db.savedPlaylists[profile.id] = (db.savedPlaylists[profile.id] ?? []).map((playlist) =>
      playlist.id === playlistId ? { ...playlist, updatedAt: timestamp } : playlist
    )
  }

  await persistDb(db)
  return savedVideo
}

export async function removeActiveSavedVideo(videoId: string, playlistId?: string | null): Promise<void> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  const targetPlaylistId = playlistId ?? null
  db.savedVideos[profile.id] = (db.savedVideos[profile.id] ?? []).filter((video) => {
    return !(video.videoId === videoId && (video.playlistId ?? null) === targetPlaylistId)
  })
  await persistDb(db)
}

export async function listActiveSearchHistory(): Promise<SearchHistoryEntry[]> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  return [...(db.searchHistories[profile.id] ?? [])].sort((a, b) => b.searchedAt - a.searchedAt)
}

export async function recordActiveSearchQuery(query: string): Promise<SearchHistoryEntry[]> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  const normalizedQuery = normalizeName(query)
  if (!normalizedQuery) return db.searchHistories[profile.id] ?? []

  const lowerQuery = normalizedQuery.toLocaleLowerCase()
  const entries = db.searchHistories[profile.id] ?? []
  const nextEntries = [
    { query: normalizedQuery, searchedAt: now() },
    ...entries.filter((entry) => entry.query.toLocaleLowerCase() !== lowerQuery)
  ].slice(0, MAX_SEARCH_HISTORY_ENTRIES)

  db.searchHistories[profile.id] = nextEntries
  await persistDb(db)
  return nextEntries
}

export async function listActiveSubscriptions(): Promise<Subscription[]> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  return [...(db.subscriptions[profile.id] ?? [])].sort((a, b) => a.channelName.localeCompare(b.channelName))
}

export async function addActiveSubscription(sub: Omit<Subscription, 'subscribedAt'>): Promise<void> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  const entries = db.subscriptions[profile.id] ?? []
  if (entries.some((existing) => existing.channelId === sub.channelId)) return
  db.subscriptions[profile.id] = [...entries, { ...sub, subscribedAt: now() }]
  await persistDb(db)
}

export async function removeActiveSubscription(channelId: string): Promise<void> {
  const db = await loadDb()
  const profile = requireActiveProfile(db)
  db.subscriptions[profile.id] = (db.subscriptions[profile.id] ?? []).filter((existing) => existing.channelId !== channelId)
  await persistDb(db)
}

export async function exportLocalData(filePath: string): Promise<void> {
  const db = await loadDb()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(db), 'utf-8')
}

export async function importLocalData(filePath: string): Promise<LocalSessionState> {
  const imported = normalizeDb(JSON.parse(await readFile(filePath, 'utf-8')))
  await persistDb(imported)
  return toSessionState(imported)
}
