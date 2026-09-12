-- ============================================================
-- 041_pipeline_won_lost_stages.sql
--
-- "Won stage" / "lost stage" flags on pipeline_stages, plus a trigger
-- that keeps deals.status in sync when a deal's stage_id changes.
--
-- Before this, deals.status ('open' | 'won' | 'lost', CHECK constraint
-- from 002_pipelines_enhancements.sql) was purely manual — set only by
-- the "Mark as Won/Lost/Reopen" buttons in the deal form
-- (src/components/pipelines/deal-form.tsx). Dragging a deal to a
-- different pipeline column (src/app/(dashboard)/pipelines/page.tsx,
-- handleDealMoved) only ever touched stage_id, leaving status
-- completely disconnected from which column a deal actually sits in.
--
-- Design notes
--   - is_won_stage / is_lost_stage are booleans on pipeline_stages, not
--     a single enum column, so "neither" (a normal mid-pipeline stage)
--     is the default and doesn't need a third sentinel value.
--   - Partial unique indexes scope "at most one won/lost stage" to
--     each pipeline_id, not globally — every pipeline gets its own
--     independent won/lost column, matching how pipelines are already
--     independent boards (pipeline_stages.pipeline_id).
--   - The trigger only fires BEFORE UPDATE OF stage_id — creating a
--     deal directly inside a won/lost stage (e.g. a manual insert or a
--     future import) does NOT retroactively set status; every existing
--     insert path in the app (deal-form.tsx) already explicitly sets
--     status: 'open' at creation time, so this only matters for a
--     stage change afterward, which is the actual use case (dragging
--     a deal onto the board's won/lost column).
--   - Not SECURITY DEFINER: pipeline_stages_select (017) already grants
--     SELECT to any account member (is_account_member(account_id), no
--     minimum role), so an agent's own RLS-scoped session can read the
--     stage row inside the trigger without elevation.
--   - Manual "Mark as Won/Lost/Reopen" (deal-form.tsx) only touches
--     `status`, never `stage_id`, so it does not fire this trigger and
--     keeps working exactly as before — a deal can be marked won
--     without moving it to a dedicated won column. Moving a manually-
--     marked deal to a different (non-won/lost) stage afterward WILL
--     reset it to 'open' via this trigger, which mirrors normal
--     pipeline semantics (leaving the closed stage reopens the deal).
--     DELIBERATE, not an oversight: deal-form.tsx is left untouched —
--     the trigger is meant to be the single source of truth once a
--     deal's stage changes, so a manual mark getting overwritten by a
--     later drag is accepted, not a bug to fix here.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS is_won_stage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_lost_stage boolean NOT NULL DEFAULT false;

-- At most one won stage and one lost stage per pipeline (not global).
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_one_won_per_pipeline
  ON pipeline_stages (pipeline_id) WHERE is_won_stage;

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_one_lost_per_pipeline
  ON pipeline_stages (pipeline_id) WHERE is_lost_stage;

-- ============================================================
-- Keep deals.status in sync with the stage a deal is moved to.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_deal_status_from_stage()
RETURNS TRIGGER AS $$
DECLARE
  v_is_won boolean;
  v_is_lost boolean;
BEGIN
  SELECT is_won_stage, is_lost_stage
    INTO v_is_won, v_is_lost
    FROM pipeline_stages
    WHERE id = NEW.stage_id;

  IF v_is_won THEN
    NEW.status := 'won';
  ELSIF v_is_lost THEN
    NEW.status := 'lost';
  ELSE
    -- Covers the normal case (a plain mid-pipeline stage) and the
    -- defensive case where NEW.stage_id somehow matches no row (the
    -- FK constraint should make that impossible, but SELECT INTO
    -- leaves v_is_won/v_is_lost NULL rather than erroring, and NULL
    -- is falsy in the IF checks above, so it falls through to here).
    NEW.status := 'open';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deals_sync_status_from_stage ON deals;
CREATE TRIGGER deals_sync_status_from_stage
  BEFORE UPDATE OF stage_id ON deals
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_deal_status_from_stage();
