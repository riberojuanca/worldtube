import { t, useLocale } from '../i18n/LocaleContext'
import { Check } from 'lucide-react'
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
      <Check className="h-4 w-4" strokeWidth={1.8} />
    </span>}
  </button>
}
