import { enUS, es } from 'date-fns/locale'

/**
 * date-fns has no idea about next-intl's NEXT_PUBLIC_APP_LOCALE — without
 * this, format()/formatDistanceToNow() render month names, weekday names,
 * and "ago" suffixes in English regardless of the app's configured locale.
 */
export const dateFnsLocale =
  process.env.NEXT_PUBLIC_APP_LOCALE === 'es' ? es : enUS
