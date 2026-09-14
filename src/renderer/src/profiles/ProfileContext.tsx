import { t, useLocale } from '../i18n/LocaleContext'
import { PageLoader } from '../components/PageLoader'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type {
  CreateLocalUserRequest,
  DeleteLocalUserRequest,
  CreateProfileRequest,
  LocalSessionState,
  LocalUser,
  LoginLocalUserRequest,
  UpdateProfileRequest,
  UserProfile
} from '../../../shared/ipc'

interface ProfileContextValue extends LocalSessionState {
  activeUser: LocalUser
  activeProfile: UserProfile
  activeProfileId: string
  createLocalUser: (request: CreateLocalUserRequest) => Promise<void>
  loginLocalUser: (request: LoginLocalUserRequest) => Promise<void>
  logoutLocalUser: () => Promise<void>
  deleteLocalUser: (request: DeleteLocalUserRequest) => Promise<void>
  createProfile: (request: CreateProfileRequest) => Promise<void>
  updateProfile: (request: UpdateProfileRequest) => Promise<void>
  setActiveProfile: (profileId: string) => Promise<void>
  removeProfile: (profileId: string) => Promise<void>
  exportData: () => Promise<string | null>
  importData: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function isMissingPreload(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes('is not a function')
}

function AuthShell({ children }: { children: ReactNode }) {
  useLocale()
  return (
    <div className="grid min-h-screen place-items-center bg-neutral-950 p-4 text-neutral-100">
      <div className="w-full max-w-sm border border-neutral-800 bg-neutral-900 p-4 shadow-2xl shadow-black/30">{children}</div>
    </div>
  )
}

function SetupLocalUser({ onCreate }: { onCreate: (request: CreateLocalUserRequest) => Promise<void> }) {
  useLocale()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await onCreate({ name, password: password.trim() || undefined })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    }
  }

  return (
    <AuthShell>
      <h1 className="text-lg font-semibold">{t("Crear usuario local")}</h1>
      <p className="mt-1 text-sm text-neutral-400">{t("Tus datos quedan en esta computadora y se pueden exportar completos.")}</p>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("Nombre")}
          className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm outline-none focus:border-neutral-500"
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("Contraseña opcional")}
          type="password"
          className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm outline-none focus:border-neutral-500"
        />
        {error && <p className="text-sm text-red-400">{t(error)}</p>}
        <button type="submit" className="wt-action-important h-10 rounded px-3 text-sm font-medium">
          {t("Empezar")}</button>
      </form>
    </AuthShell>
  )
}

function LoginLocalUser({
  users,
  onLogin
}: {
  users: LocalUser[]
  onLogin: (request: LoginLocalUserRequest) => Promise<void>
}) {
  useLocale()
  const [userId, setUserId] = useState(users[0]?.id ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const selectedUser = users.find((user) => user.id === userId) ?? users[0]

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!selectedUser) return
    try {
      await onLogin({ userId: selectedUser.id, password: password || undefined })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    }
  }

  return (
    <AuthShell>
      <h1 className="text-lg font-semibold">{t("Iniciar sesión local")}</h1>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <select
          value={selectedUser?.id ?? ''}
          onChange={(event) => {
            setUserId(event.target.value)
            setPassword('')
            setError(null)
          }}
          className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm outline-none focus:border-neutral-500"
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        {selectedUser?.hasPassword && (
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("Contraseña")}
            type="password"
            className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm outline-none focus:border-neutral-500"
          />
        )}
        {error && <p className="text-sm text-red-400">{t(error)}</p>}
        <button type="submit" className="wt-action-important h-10 rounded px-3 text-sm font-medium">
          {t("Entrar")}</button>
      </form>
    </AuthShell>
  )
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  useLocale()
  const [state, setState] = useState<LocalSessionState | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .getSessionState()
      .then((nextState) => {
        if (!cancelled) setState(nextState)
      })
      .catch((error) => {
        if (!cancelled) {
          setBootError(
            isMissingPreload(error)
              ? t("Reiniciá WorldTube para cargar la sesión local nueva.")
              : error instanceof Error
                ? error.message
                : String(error)
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const createLocalUser = useCallback(async (request: CreateLocalUserRequest) => {
    setState(await window.api.createLocalUser(request))
  }, [])

  const loginLocalUser = useCallback(async (request: LoginLocalUserRequest) => {
    setState(await window.api.loginLocalUser(request))
  }, [])

  const logoutLocalUser = useCallback(async () => {
    setState(await window.api.logoutLocalUser())
  }, [])

  const deleteLocalUser = useCallback(async (request: DeleteLocalUserRequest) => {
    setState(await window.api.deleteLocalUser(request))
  }, [])

  const reloadSessionState = useCallback(async () => {
    setState(await window.api.getSessionState())
  }, [])

  const createProfile = useCallback(async (request: CreateProfileRequest) => {
    await window.api.createProfile(request)
    await reloadSessionState()
  }, [reloadSessionState])

  const updateProfile = useCallback(async (request: UpdateProfileRequest) => {
    await window.api.updateProfile(request)
    await reloadSessionState()
  }, [reloadSessionState])

  const setActiveProfile = useCallback(async (profileId: string) => {
    await window.api.setActiveProfile(profileId)
    await reloadSessionState()
  }, [reloadSessionState])

  const removeProfile = useCallback(async (profileId: string) => {
    await window.api.removeProfile(profileId)
    await reloadSessionState()
  }, [reloadSessionState])

  const exportData = useCallback(() => window.api.exportData(), [])

  const importData = useCallback(async () => {
    const importedState = await window.api.importData()
    if (importedState) setState(importedState)
  }, [])

  const value = useMemo<ProfileContextValue | null>(() => {
    if (!state?.activeUser || !state.activeProfile || !state.activeProfileId) return null
    return {
      ...state,
      activeUser: state.activeUser,
      activeProfile: state.activeProfile,
      activeProfileId: state.activeProfileId,
      createLocalUser,
      loginLocalUser,
      logoutLocalUser,
      deleteLocalUser,
      createProfile,
      updateProfile,
      setActiveProfile,
      removeProfile,
      exportData,
      importData
    }
  }, [
    createLocalUser,
    createProfile,
    deleteLocalUser,
    exportData,
    importData,
    loginLocalUser,
    logoutLocalUser,
    removeProfile,
    setActiveProfile,
    state,
    updateProfile
  ])

  if (bootError) {
    return (
      <AuthShell>
        <h1 className="text-lg font-semibold">{t("Sesión local")}</h1>
        <p className="mt-2 text-sm text-red-400">{t(bootError)}</p>
      </AuthShell>
    )
  }

  if (!state) {
    return <div className="bg-neutral-950"><PageLoader fullScreen /></div>
  }

  if (state.setupRequired) {
    return <SetupLocalUser onCreate={createLocalUser} />
  }

  if (!value) {
    return <LoginLocalUser users={state.users} onLogin={loginLocalUser} />
  }

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfiles(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfiles must be used inside ProfileProvider')
  return ctx
}
