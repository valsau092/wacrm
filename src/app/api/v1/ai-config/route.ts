// ============================================================
// GET /api/v1/ai-config — read the AI assistant's safe behaviour
// params + knowledge base (scope: ai_config:read)
//
// Deliberately excludes provider/model/api_key/embeddings_api_key —
// those are credentials/infra config, not behaviour params, and never
// belong on the public API. This is a read-only counterpart to the
// dashboard's `GET /api/ai/config` (cookie-session, requireRole
// 'agent'), meant for machine callers (e.g. an n8n workflow) rather
// than the browser — separate route, separate auth, untouched by
// this change.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, toApiErrorResponse } from '@/lib/api/v1/respond';

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'ai_config:read');

    const { data: config } = await ctx.supabase
      .from('ai_configs')
      .select(
        'system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, handoff_agent_id',
      )
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    const { data: docs } = await ctx.supabase
      .from('ai_knowledge_documents')
      .select('title, content')
      .eq('account_id', ctx.accountId)
      .order('updated_at', { ascending: false });

    if (!config) {
      return ok({ configured: false, knowledge_base: docs ?? [] });
    }

    return ok({
      configured: true,
      assistant_enabled: config.is_active,
      auto_reply_enabled: config.auto_reply_enabled,
      auto_reply_max_per_conversation: config.auto_reply_max_per_conversation,
      handoff_agent_id: config.handoff_agent_id,
      business_context: config.system_prompt,
      knowledge_base: docs ?? [],
    });
  } catch (err) {
    return toApiErrorResponse(err);
  }
}
