// ============================================================
// Public API (v1) media helpers — the `media` object on the
// message.received webhook + message responses, and the id checks
// behind GET /api/v1/media/{media_id}.
//
// Inbound media is identified by Meta's media id. We never stored it
// in its own column, but both shapes `messages.media_url` takes for
// inbound media embed it:
//   - mirrored:  …/chat-media/account-<id>/inbound/<mediaId>-<name>.<ext>
//   - proxy:     /api/whatsapp/media/<mediaId>
// so it can be recovered from the URL (see `mediaIdFromUrl`).
// ============================================================

export interface ApiMedia {
  /** Meta's media id — pass it to GET /api/v1/media/{media_id}. */
  media_id: string | null;
  mime_type: string | null;
  caption: string | null;
  filename: string | null;
  sha256: string | null;
}

/** Meta media ids are numeric strings. Anything else is a 404. */
export function isMetaMediaId(value: string): boolean {
  return /^\d{1,32}$/.test(value);
}

/** Media object shape inside a raw Meta webhook message. */
interface RawMetaMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
}

const RAW_MEDIA_KINDS = ['image', 'audio', 'video', 'document', 'sticker'] as const;

/**
 * Build the `media` object for a message.received payload from the raw
 * Meta webhook message, or null when it isn't a media message. Reads
 * the raw payload (not our DB row) so `sha256` / `filename` / `caption`
 * come through exactly as Meta sent them.
 */
export function inboundMediaPayload(message: {
  type: string;
  [kind: string]: unknown;
}): ApiMedia | null {
  if (!(RAW_MEDIA_KINDS as readonly string[]).includes(message.type)) {
    return null;
  }
  const raw = message[message.type] as RawMetaMedia | undefined;
  if (!raw?.id) return null;
  return {
    media_id: raw.id,
    mime_type: raw.mime_type ?? null,
    caption: raw.caption ?? null,
    filename: raw.filename ?? null,
    sha256: raw.sha256 ?? null,
  };
}

/**
 * Recover Meta's media id from an inbound message's stored
 * `media_url` (mirrored object name or proxy path), or null.
 */
export function mediaIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /\/(\d+)(?:-[^/?]*)?(?:\?.*)?$/.exec(url);
  return match ? match[1] : null;
}
