// ============================================================
// Public API (v1) serializers for conversations + messages.
//
// The dashboard's `Conversation`/`Message` rows carry internal columns
// (account_id, user_id, sender_id) that shouldn't leak onto the public
// wire. These serializers project the stable public subset and rename
// the Meta id (`message_id` → `whatsapp_message_id`) to match the send
// endpoint's response vocabulary.
// ============================================================

import type { Conversation, Message } from '@/types';
import { mediaIdFromUrl, type ApiMedia } from '@/lib/api/v1/media';

export interface ApiConversation {
  id: string;
  contact_id: string;
  status: string;
  assigned_agent_id: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  /** AI replies are paused on this thread (`ai_autoreply_disabled`). */
  ai_paused: boolean;
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    phone: string;
    name: string | null;
    email: string | null;
    company: string | null;
    tags: { id: string; name: string; color: string }[];
  } | null;
}

export interface ApiMessage {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  sender_type: string;
  content_type: string;
  content_text: string | null;
  media_url: string | null;
  template_name: string | null;
  whatsapp_message_id: string | null;
  status: string;
  reply_to_message_id: string | null;
  interactive_reply_id: string | null;
  /**
   * Who sent an outbound message (null on inbound):
   *   ai         — an AI reply (public-API send or the built-in bot)
   *   agent      — a human agent from the inbox; see sent_by_agent_id
   *   automation — a Flow / automation / broadcast send
   *   unknown    — an agent send stored before attribution existed
   */
  sent_by_type: SentByType | null;
  /** The agent's user id (profiles.user_id) when sent_by_type='agent'. */
  sent_by_agent_id: string | null;
  /**
   * Media details for image / audio / video / document messages, else
   * null. `media_id` (inbound only) is what GET /api/v1/media/{id}
   * takes. `sha256` and `filename` aren't stored, so they're null here
   * (the message.received webhook carries them).
   */
  media: ApiMedia | null;
  created_at: string;
}

const MEDIA_CONTENT_TYPES = new Set(['image', 'audio', 'video', 'document']);

/** Project a message row's media columns into the public `media` object. */
export function messageMedia(m: Message): ApiMedia | null {
  if (!MEDIA_CONTENT_TYPES.has(m.content_type) || !m.media_url) return null;
  return {
    media_id: m.sender_type === 'customer' ? mediaIdFromUrl(m.media_url) : null,
    mime_type: m.media_type ?? null,
    caption: m.content_text ?? null,
    filename: null,
    sha256: null,
  };
}

export type SentByType = 'ai' | 'agent' | 'automation' | 'unknown';

/** Derive the public sent-by attribution from a message row. */
export function messageSentBy(m: Message): {
  sent_by_type: SentByType | null;
  sent_by_agent_id: string | null;
} {
  if (m.sender_type === 'customer') {
    return { sent_by_type: null, sent_by_agent_id: null };
  }
  if (m.ai_generated) return { sent_by_type: 'ai', sent_by_agent_id: null };
  if (m.sender_id) {
    return { sent_by_type: 'agent', sent_by_agent_id: m.sender_id };
  }
  return {
    sent_by_type: m.sender_type === 'bot' ? 'automation' : 'unknown',
    sent_by_agent_id: null,
  };
}

/**
 * Project a normalized `Conversation` (from `normalizeConversation`,
 * which has already flattened `contact.tags`) into the public shape.
 */
export function serializeConversation(conv: Conversation): ApiConversation {
  const c = conv.contact;
  return {
    id: conv.id,
    contact_id: conv.contact_id,
    status: conv.status,
    assigned_agent_id: conv.assigned_agent_id ?? null,
    last_message_text: conv.last_message_text ?? null,
    last_message_at: conv.last_message_at ?? null,
    unread_count: conv.unread_count ?? 0,
    ai_paused: conv.ai_autoreply_disabled ?? false,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    contact: c
      ? {
          id: c.id,
          phone: c.phone,
          name: c.name ?? null,
          email: c.email ?? null,
          company: c.company ?? null,
          tags: (c.tags ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
          })),
        }
      : null,
  };
}

/** Project a `messages` row into the public shape. */
export function serializeMessage(m: Message): ApiMessage {
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    // `customer` = inbound (from the contact); anything else is outbound.
    direction: m.sender_type === 'customer' ? 'inbound' : 'outbound',
    sender_type: m.sender_type,
    content_type: m.content_type,
    content_text: m.content_text ?? null,
    media_url: m.media_url ?? null,
    template_name: m.template_name ?? null,
    whatsapp_message_id: m.message_id ?? null,
    status: m.status,
    reply_to_message_id: m.reply_to_message_id ?? null,
    interactive_reply_id: m.interactive_reply_id ?? null,
    ...messageSentBy(m),
    media: messageMedia(m),
    created_at: m.created_at,
  };
}
