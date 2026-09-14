import { t, useLocale } from '../i18n/LocaleContext'
export function SubscribeButton({ subscribed, busy = false, onClick }: {
  subscribed: boolean
  busy?: boolean
  onClick: () => void
}) {
  useLocale()
  return <button
    type="button"
    disabled={busy}
    onClick={onClick}
    aria-pressed={subscribed}
    title={subscribed ? t('Cancelar suscripción') : t("Suscribirse")}
    className="wt-action-important inline-flex h-9 shrink-0 cursor-pointer items-center overflow-hidden rounded text-sm font-medium disabled:cursor-wait disabled:opacity-60"
  >
    <span className="px-4">{subscribed ? t("Suscripto") : t("Suscribirse")}</span>
    {subscribed && <span className="wt-subscription-check" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12 4 4L19 6" />
      </svg>
    </span>}
  </button>
}
