-- ============================================================
-- 042_pipeline_stage_set_outcome.sql
--
-- RPC backing the "mark this stage as Won / Lost" toggle in
-- PipelineSettings (src/components/pipelines/pipeline-settings.tsx).
--
-- Why an RPC instead of two sequential client-side .update() calls:
-- supabase-js has no client-side multi-statement transaction API —
-- each .update() is its own independent request. The partial unique
-- indexes from 041 (one won stage, one lost stage per pipeline_id)
-- mean "unmark the old one, then mark the new one" must happen
-- atomically or a crash/network drop between the two calls could
-- leave a pipeline with either two won stages (impossible, the index
-- would reject it) or briefly none — a single plpgsql function body
-- is one transaction, so this can't happen.
--
-- NOT SECURITY DEFINER (default = SECURITY INVOKER): the UPDATEs
-- inside run as the calling user, so they stay subject to
-- pipeline_stages_modify (017_account_sharing.sql — admin+ only). A
-- non-admin's call silently affects 0 rows instead of erroring — same
-- "RLS is the real gate" pattern already used across this schema. No
-- new authorization logic is introduced here.
--
-- p_outcome: 'won' | 'lost' | NULL (NULL clears the flag on this
-- stage without setting it anywhere else — lets an admin unmark a
-- stage entirely, not just move the flag around).
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_pipeline_stage_outcome(
  p_stage_id uuid,
  p_outcome text
) RETURNS void AS $$
DECLARE
  v_pipeline_id uuid;
BEGIN
  IF p_outcome IS NOT NULL AND p_outcome NOT IN ('won', 'lost') THEN
    RAISE EXCEPTION 'p_outcome must be ''won'', ''lost'', or NULL';
  END IF;

  SELECT pipeline_id INTO v_pipeline_id
    FROM pipeline_stages
    WHERE id = p_stage_id;

  IF v_pipeline_id IS NULL THEN
    RAISE EXCEPTION 'Stage % not found', p_stage_id;
  END IF;

  IF p_outcome = 'won' THEN
    -- Unmark whichever other stage in this pipeline currently holds
    -- the flag (if any) BEFORE marking the new one, so the partial
    -- unique index is never hit by two true rows at once.
    UPDATE pipeline_stages SET is_won_stage = false
      WHERE pipeline_id = v_pipeline_id AND is_won_stage AND id <> p_stage_id;
    UPDATE pipeline_stages SET is_won_stage = true, is_lost_stage = false
      WHERE id = p_stage_id;
  ELSIF p_outcome = 'lost' THEN
    UPDATE pipeline_stages SET is_lost_stage = false
      WHERE pipeline_id = v_pipeline_id AND is_lost_stage AND id <> p_stage_id;
    UPDATE pipeline_stages SET is_lost_stage = true, is_won_stage = false
      WHERE id = p_stage_id;
  ELSE
    UPDATE pipeline_stages SET is_won_stage = false, is_lost_stage = false
      WHERE id = p_stage_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- This self-hosted instance revokes the default PUBLIC execute
-- privilege (see 029_ai_reply.sql's note on claim_ai_reply_slot) — an
-- explicit grant is required or every call 403s with
-- permission-denied regardless of RLS. `authenticated` covers every
-- logged-in role; RLS on the UPDATEs above is still what actually
-- gates admin-only writes.
GRANT EXECUTE ON FUNCTION public.set_pipeline_stage_outcome(uuid, text) TO authenticated;
