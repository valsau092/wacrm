-- ============================================================
-- 044_revoke_secdef_rpc_from_clients
--
-- These SECURITY DEFINER functions bypass RLS and do not check
-- auth.uid(). They are only called by the server with the
-- service_role key (record_webhook_failure, claim_ai_reply_slot),
-- by SECURITY DEFINER triggers owned by postgres (_bcast_bump,
-- recompute_broadcast_counts) or once by migrations 022/036
-- (merge_duplicate_*).
--
-- Migrations 022/036 ran REVOKE ... FROM PUBLIC, but Supabase's
-- default privileges on schema public grant EXECUTE explicitly to
-- anon and authenticated, so the functions stayed callable through
-- /rest/v1/rpc/* with the anon key. Revoke from all three; the owner
-- and service_role keep EXECUTE.
--
-- Idempotent — safe to re-run.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.merge_duplicate_contacts()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_duplicate_conversations()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_webhook_failure(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_ai_reply_slot(uuid, integer)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._bcast_bump(uuid, text, integer)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_broadcast_counts(uuid)      FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.merge_duplicate_contacts()            TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_conversations()       TO service_role;
GRANT EXECUTE ON FUNCTION public.record_webhook_failure(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ai_reply_slot(uuid, integer)    TO service_role;
GRANT EXECUTE ON FUNCTION public._bcast_bump(uuid, text, integer)      TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_broadcast_counts(uuid)      TO service_role;
