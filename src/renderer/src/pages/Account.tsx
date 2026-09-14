import { t, useLocale, locale } from '../i18n/LocaleContext'
import { useState, type FormEvent } from 'react'
import { PROFILE_DATA_CHANGED_EVENT } from '../profiles/events'
import { useProfiles } from '../profiles/ProfileContext'
import { ApplicationSettings } from '../components/ApplicationSettings'
import type { LocalUser, UserProfile } from '../../../shared/ipc'

function formatDate(timestamp: number): string {
  if (!timestamp) return t("Sin fecha")
  return new Date(timestamp).toLocaleString(locale())
}

function profileInitial(profile: UserProfile): string {
  return profile.name.trim().slice(0, 1).toUpperCase() || 'P'
}

function ProfileAvatar({ profile, size = 'h-9 w-9' }: { profile: UserProfile; size?: string }) {
  useLocale()
  if (profile.avatarDataUrl) {
    return <img src={profile.avatarDataUrl} alt="" className={`${size} shrink-0 rounded object-cover`} />
  }

  return (
    <span
      className={`${size} grid shrink-0 place-items-center rounded text-sm font-semibold`}
      style={{ backgroundColor: profile.color, color: profile.textColor }}
    >
      {profileInitial(profile)}
    </span>
  )
}

function userInitial(user: LocalUser): string {
  return user.name.trim().slice(0, 1).toUpperCase() || 'U'
}

export function Account() {
  useLocale()
  const {
    users,
    activeUser,
    activeUserId,
    profiles,
    activeProfileId,
    stats,
    dataPath,
    storageVersion,
    createLocalUser,
    deleteLocalUser,
    createProfile,
    removeProfile,
    setActiveProfile,
    exportData,
    importData,
    logoutLocalUser
  } = useProfiles()
  const [profileName, setProfileName] = useState('')
  const [userName, setUserName] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [confirmProfileId, setConfirmProfileId] = useState<string | null>(null)
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const safeStats = stats ?? {
    users: users.length,
    profiles: profiles.length,
    activeHistoryEntries: 0,
    activeSubscriptions: 0,
    activeSavedPlaylists: 0,
    activeSavedVideos: 0,
    historyEntries: 0,
    subscriptions: 0,
    savedPlaylists: 0,
    savedVideos: 0,
    settingsKeys: 0
  }
  const safeDataPath = dataPath ?? 'worldtube-data.json'
  const safeStorageVersion = storageVersion ?? 1

  async function handleCreateProfile(event: FormEvent) {
    event.preventDefault()
    try {
      await createProfile({ name: profileName })
      setProfileName('')
      setMessage(t("Perfil creado"))
      setError(null)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError))
    }
  }

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault()
    try {
      await createLocalUser({ name: userName, password: userPassword.trim() || undefined })
      setUserName('')
      setUserPassword('')
      setMessage(t("Usuario creado"))
      setError(null)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError))
    }
  }

  async function handleRemoveProfile(profileId: string) {
    if (confirmProfileId !== profileId) {
      setConfirmProfileId(profileId)
      return
    }

    try {
      await removeProfile(profileId)
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
      setConfirmProfileId(null)
      setMessage(t("Perfil eliminado"))
      setError(null)
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError))
    }
  }

  async function handleDeleteUser(userId: string) {
    if (confirmUserId !== userId) {
      setConfirmUserId(userId)
      return
    }

    try {
      await deleteLocalUser({ userId })
      window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
      setConfirmUserId(null)
      setMessage(t("Usuario eliminado"))
      setError(null)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  }

  async function handleExport() {
    const filePath = await exportData()
    setMessage(filePath ? t('Exportado: {path}', { path: filePath }) : t("Exportación cancelada"))
    setError(null)
  }

  async function handleImport() {
    await importData()
    window.dispatchEvent(new Event('worldtube:preferences-changed'))
    window.dispatchEvent(new CustomEvent(PROFILE_DATA_CHANGED_EVENT))
    setMessage(t("Datos importados"))
    setError(null)
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold">{t("Cuenta")}</h1>
          <p className="mt-1 text-sm text-neutral-400">{t("Datos locales de")} {activeUser.name}</p>
        </div>
        <button type="button" onClick={logoutLocalUser} className="rounded px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900">
          {t("Cerrar sesión")}</button>
      </header>

      {(message || error) && (
        <div className={['border px-3 py-2 text-sm', error ? 'border-red-900 bg-red-950/30 text-red-300' : 'border-neutral-800 bg-neutral-900 text-neutral-300'].join(' ')}>
          {t(error ?? message ?? '')}
        </div>
      )}

      <ApplicationSettings />

      <section className="grid gap-3">
        <h2 className="border-b border-neutral-800 pb-2 text-base font-semibold">{t("Usuarios locales")}</h2>
        <div className="divide-y divide-neutral-800 border-y border-neutral-800">
          {users.map((user) => (
            <div key={user.id} className="grid gap-3 py-3 md:grid-cols-[1fr_auto] md:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-neutral-800 text-sm font-semibold">{userInitial(user)}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {user.name}
                    {user.id === activeUserId && <span className="ml-2 text-xs text-neutral-500">{t("activo")}</span>}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {user.hasPassword ? t("Con contraseña") : t("Sin contraseña")} {t("· creado")} {formatDate(user.createdAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteUser(user.id)}
                className="rounded px-3 py-2 text-sm text-red-300 hover:bg-red-950/40"
              >
                {confirmUserId === user.id ? t("Confirmar eliminación") : t("Eliminar usuario")}
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={handleCreateUser} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
            placeholder={t("Nombre de usuario")}
            className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm outline-none focus:border-neutral-500"
          />
          <input
            value={userPassword}
            onChange={(event) => setUserPassword(event.target.value)}
            placeholder={t("Contraseña opcional")}
            type="password"
            className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm outline-none focus:border-neutral-500"
          />
          <button type="submit" className="rounded bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-700">
            {t("Crear usuario")}</button>
        </form>
      </section>

      <section className="grid gap-3">
        <h2 className="border-b border-neutral-800 pb-2 text-base font-semibold">{t("Perfiles de")} {activeUser.name}</h2>
        <div className="divide-y divide-neutral-800 border-y border-neutral-800">
          {profiles.map((profile) => (
            <div key={profile.id} className="grid gap-3 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar profile={profile} />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {profile.name}
                    {profile.id === activeProfileId && <span className="ml-2 text-xs text-neutral-500">{t("activo")}</span>}
                  </p>
                  <p className="truncate text-xs text-neutral-500">{t("creado")} {formatDate(profile.createdAt)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveProfile(profile.id)}
                disabled={profile.id === activeProfileId}
                className="rounded px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:cursor-default disabled:text-neutral-600 disabled:hover:bg-transparent"
              >
                {t("Activar")}</button>
              <button
                type="button"
                onClick={() => handleRemoveProfile(profile.id)}
                className="rounded px-3 py-2 text-sm text-red-300 hover:bg-red-950/40"
              >
                {confirmProfileId === profile.id ? t("Confirmar eliminación") : t("Eliminar perfil")}
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={handleCreateProfile} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder={t("Nombre de perfil")}
            className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm outline-none focus:border-neutral-500"
          />
          <button type="submit" className="rounded bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-700">
            {t("Crear perfil")}</button>
        </form>
      </section>

      <details className="border-t border-neutral-800 pt-3">
        <summary className="cursor-pointer select-none text-sm font-medium text-neutral-300 hover:text-neutral-100">
          {t("Paquete local y exportación")}</summary>
        <div className="mt-4 grid gap-4 text-sm">
          <p className="break-words text-neutral-400">{safeDataPath}</p>
          <dl className="grid gap-x-6 md:grid-cols-2">
            <div className="flex items-center justify-between border-b border-neutral-800 py-2">
              <dt className="text-neutral-500">{t("Usuarios")}</dt>
              <dd className="font-medium">{safeStats.users}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 py-2">
              <dt className="text-neutral-500">{t("Perfiles")}</dt>
              <dd className="font-medium">{safeStats.profiles}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 py-2">
              <dt className="text-neutral-500">{t("Historial")}</dt>
              <dd className="font-medium">{safeStats.historyEntries}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 py-2">
              <dt className="text-neutral-500">{t("Suscripciones")}</dt>
              <dd className="font-medium">{safeStats.subscriptions}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 py-2">
              <dt className="text-neutral-500">{t("Playlists")}</dt>
              <dd className="font-medium">{safeStats.savedPlaylists}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 py-2">
              <dt className="text-neutral-500">{t("Videos guardados")}</dt>
              <dd className="font-medium">{safeStats.savedVideos}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800 py-2">
              <dt className="text-neutral-500">{t("Versión DB")}</dt>
              <dd className="font-medium">{safeStorageVersion}</dd>
            </div>
          </dl>
          <div className="grid gap-1 text-neutral-400">
            <p>
              {t("Se exporta: usuarios locales, hashes de contraseña, sesión activa, perfiles con nombre/color/foto, historial, suscripciones, playlists guardadas, videos guardados y settings.")}</p>
            <p>{t("No se exporta: cachés temporales de video, procesos de reproducción, tokens efímeros de YouTube ni archivos de build.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleExport} className="wt-action-important rounded px-3 py-2 text-sm font-medium">
              {t("Exportar todo")}</button>
            <button type="button" onClick={handleImport} className="rounded bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-700">
              {t("Importar paquete")}</button>
          </div>
        </div>
      </details>
    </div>
  )
}
