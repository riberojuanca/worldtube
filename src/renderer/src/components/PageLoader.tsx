import { t, useLocale } from '../i18n/LocaleContext'
import { BrandMark } from './BrandMark'

export function PageLoader({ fullScreen = false, compact = false }: { fullScreen?: boolean; compact?: boolean }) {
  useLocale()
  return <div role="status" aria-label={t('Cargando…')}
    className={`wt-page-loader ${fullScreen ? 'wt-page-loader-full' : ''} ${compact ? 'wt-page-loader-compact' : ''}`}>
    <span className="wt-page-loader-mark"><BrandMark /></span>
  </div>
}
