import type { AutomationTriggerType } from '@/types'

export interface TriggerMeta {
  /** i18n key under Automations.list, or null for an unrecognized trigger type. */
  labelKey: string | null
  /** Raw trigger type, shown as a fallback when labelKey is null. */
  fallbackLabel: string
  /** Tailwind classes for the Badge pill on the list row. */
  pillClass: string
}

export const TRIGGER_META: Record<AutomationTriggerType, TriggerMeta> = {
  new_message_received: {
    labelKey: 'triggerNewMessage',
    fallbackLabel: 'new_message_received',
    pillClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  },
  first_inbound_message: {
    labelKey: 'triggerFirstMessage',
    fallbackLabel: 'first_inbound_message',
    pillClass: 'border-teal-500/30 bg-teal-500/10 text-teal-300',
  },
  keyword_match: {
    labelKey: 'triggerKeywordMatch',
    fallbackLabel: 'keyword_match',
    pillClass: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  },
  new_contact_created: {
    labelKey: 'triggerNewContact',
    fallbackLabel: 'new_contact_created',
    pillClass: 'border-primary/30 bg-primary/10 text-primary',
  },
  conversation_assigned: {
    labelKey: 'triggerConversationAssigned',
    fallbackLabel: 'conversation_assigned',
    pillClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  },
  tag_added: {
    labelKey: 'triggerTagAdded',
    fallbackLabel: 'tag_added',
    pillClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
  time_based: {
    labelKey: 'triggerTimeBased',
    fallbackLabel: 'time_based',
    pillClass: 'border-slate-500/30 bg-slate-500/10 text-muted-foreground',
  },
  interactive_reply: {
    labelKey: 'triggerInteractiveReply',
    fallbackLabel: 'interactive_reply',
    pillClass: 'border-pink-500/30 bg-pink-500/10 text-pink-300',
  },
}

export function triggerMeta(t: AutomationTriggerType | string): TriggerMeta {
  return (
    TRIGGER_META[t as AutomationTriggerType] ?? {
      labelKey: null,
      fallbackLabel: t,
      pillClass: 'border-slate-500/30 bg-slate-500/10 text-muted-foreground',
    }
  )
}

type RelativeTimeTranslator = (key: string, values?: Record<string, number>) => string

export function formatRelative(
  iso: string | null | undefined,
  t: RelativeTimeTranslator,
): string {
  if (!iso) return t('timeNever')
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return t('timeNever')
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return t('timeJustNow')
  if (diffSec < 3600) return t('timeM', { min: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return t('timeH', { hr: Math.floor(diffSec / 3600) })
  if (diffSec < 2_592_000) return t('timeD', { day: Math.floor(diffSec / 86400) })
  return new Date(iso).toLocaleDateString()
}
