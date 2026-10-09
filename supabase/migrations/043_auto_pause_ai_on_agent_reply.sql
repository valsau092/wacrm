-- ============================================================
-- 043_auto_pause_ai_on_agent_reply
--
-- Per-account switch: when a human agent sends a message from the
-- inbox (POST /api/whatsapp/send — never the public API, Flows,
-- automations or broadcasts), set the conversation's
-- `ai_autoreply_disabled` (exposed as `ai_paused` on /api/v1) so an AI
-- agent stops answering over the human. On by default; agents resume
-- the AI with the inbox header toggle.
--
-- No RLS change: whatsapp_config SELECT is agent+ (migration 040) and
-- UPDATE admin+ (017), which is what the send route and the Settings
-- switch need.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS auto_pause_ai_on_agent_reply boolean NOT NULL DEFAULT true;
