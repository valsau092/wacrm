// ============================================================
// GET /api/v1/media/{media_id} — download an inbound media file
// (scope: messages:read).
//
// `media_id` is Meta's id, as delivered in the message.received
// webhook's `data.media.media_id`. The bytes are fetched from Meta
// with the account's stored access token (resolve the URL via the
// Graph API, then download it — Meta's URL needs the Bearer header)
// and streamed back with Meta's Content-Type, so a caller never needs
// a Meta token of its own.
//
// Tenancy: the id must belong to an inbound message in the key's
// account (matched through `messages.media_url`, which embeds it — see
// `@/lib/api/v1/media`). A malformed or foreign id is a 404.
//
// If Meta no longer has the file (it deletes media ~30 days after
// receipt) and the webhook mirrored it to Storage, the mirrored copy
// is streamed instead.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { isMetaMediaId } from '@/lib/api/v1/media';
import { getMediaUrl, streamMedia } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'messages:read');
    const { mediaId } = await params;
    if (!isMetaMediaId(mediaId)) {
      return fail('not_found', 'Media not found', 404);
    }

    // Ownership: an inbound message in this account whose media_url
    // embeds the id (mirrored `…/<id>-<name>.<ext>` or proxy `…/<id>`).
    // `mediaId` is digits-only (checked above), so it is safe to
    // interpolate into the filter string.
    const { data: msg, error: msgError } = await ctx.supabase
      .from('messages')
      .select('media_url, media_type, conversations!inner(account_id)')
      .eq('conversations.account_id', ctx.accountId)
      .eq('sender_type', 'customer')
      .or(`media_url.like.*/${mediaId},media_url.like.*/${mediaId}-*`)
      .limit(1)
      .maybeSingle();

    if (msgError) {
      console.error('[api/v1/media] lookup error:', msgError.message);
      return fail('internal', 'Failed to look up media', 500);
    }
    if (!msg) return fail('not_found', 'Media not found', 404);

    const { data: config } = await ctx.supabase
      .from('whatsapp_config')
      .select('access_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!config?.access_token) {
      return fail(
        'whatsapp_not_configured',
        'WhatsApp is not configured for this account',
        400
      );
    }

    let file: Awaited<ReturnType<typeof streamMedia>> | null = null;
    try {
      const accessToken = decrypt(config.access_token);
      const info = await getMediaUrl({ mediaId, accessToken });
      file = await streamMedia({ downloadUrl: info.url, accessToken });
      if (file.contentType === 'application/octet-stream') {
        file.contentType = info.mimeType;
      }
    } catch (err) {
      // Log the reason only — never the token or Meta's signed URL.
      console.warn(
        `[api/v1/media] Meta fetch failed for ${mediaId}:`,
        err instanceof Error ? err.message : err
      );
    }

    // Fall back to the Storage mirror (public bucket, no auth).
    if (!file && msg.media_url?.startsWith('http')) {
      const res = await fetch(msg.media_url).catch(() => null);
      if (res?.ok && res.body) {
        file = {
          body: res.body,
          contentType:
            msg.media_type ||
            res.headers.get('content-type') ||
            'application/octet-stream',
          contentLength: res.headers.get('content-length'),
        };
      }
    }

    if (!file) {
      return fail(
        'media_unavailable',
        'Media could not be fetched from Meta (it may have expired)',
        502
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, max-age=3600',
    };
    return new Response(file.body, { status: 200, headers });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
