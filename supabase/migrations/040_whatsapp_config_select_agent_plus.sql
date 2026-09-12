-- ============================================================
-- 040_whatsapp_config_select_agent_plus.sql
--
-- Tighten the read-side gap on whatsapp_config left by 017: INSERT/
-- UPDATE/DELETE were already admin+ (is_account_member(account_id,
-- 'admin')), but SELECT only required membership in the account at
-- any role — including a future viewer.
--
-- NOT raised to admin-only: an agent's own RLS-scoped session reads
-- this table on the hot path for core messaging —
-- sendMessageToConversation() (src/lib/whatsapp/send-message.ts,
-- called from /api/whatsapp/send), reacting to a message
-- (/api/whatsapp/react), downloading inbound media
-- (/api/whatsapp/media/[mediaId]), and the Inbox connection-status
-- banner (src/app/(dashboard)/inbox/page.tsx). All of those run under
-- requireRole('agent') or no role check at all — an admin-only SELECT
-- would 403/silently-empty every one of them for an agent, breaking
-- the ability to send messages at all.
--
-- 'agent' is the correct floor: it still excludes a future viewer
-- (rank 1 < agent's rank 2 in hasMinRole/roleRank), while leaving
-- every agent+ read path working exactly as before. The Settings-page
-- exposure this was meant to close is already handled at the API
-- layer (GET /api/whatsapp/config now calls requireRole('admin')).
--
-- Idempotent — safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS whatsapp_config_select ON whatsapp_config;
CREATE POLICY whatsapp_config_select ON whatsapp_config FOR SELECT
  USING (is_account_member(account_id, 'agent'));
