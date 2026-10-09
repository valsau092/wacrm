// ============================================================
// GET   /api/v1/conversations/{id} — read one conversation
//       (scope: conversations:read).
// PATCH /api/v1/conversations/{id} — update it (scope:
//       conversations:write). Body: { "ai_paused": boolean }.
// Account-scoped: a foreign id → 404.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { isUuid } from '@/lib/api/v1/pagination';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  CONVERSATION_SELECT,
  normalizeConversation,
} from '@/lib/inbox/conversations';
import { serializeConversation } from '@/lib/api/v1/conversations';
import type { Conversation } from '@/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'conversations:read');
    const { id } = await params;
    if (!isUuid(id)) return fail('not_found', 'Conversation not found', 404);

    const { data, error } = await ctx.supabase
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/conversations] read error:', error);
      return fail('internal', 'Failed to read conversation', 500);
    }
    if (!data) return fail('not_found', 'Conversation not found', 404);

    return ok(serializeConversation(normalizeConversation(data as Conversation)));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireApiKey(request, 'conversations:write');
    const { id } = await params;
    if (!isUuid(id)) return fail('not_found', 'Conversation not found', 404);

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }
    if (typeof body.ai_paused !== 'boolean') {
      return fail('bad_request', "'ai_paused' (boolean) is required", 400);
    }

    const { data, error } = await ctx.supabase
      .from('conversations')
      .update({
        ai_autoreply_disabled: body.ai_paused,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(CONVERSATION_SELECT)
      .maybeSingle();

    if (error) {
      console.error('[api/v1/conversations] update error:', error);
      return fail('internal', 'Failed to update conversation', 500);
    }
    if (!data) return fail('not_found', 'Conversation not found', 404);

    return ok(serializeConversation(normalizeConversation(data as Conversation)));
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
