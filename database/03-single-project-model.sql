-- ============================================
-- NOVA: SINGLE PROJECT MODEL (Phase 2)
-- One project = one row, context_type = current phase
-- Created: November 4, 2025
-- ============================================

-- ============================================
-- STEP 1: Remove duplicate constraint
-- ============================================

-- Drop old constraint that allowed duplicates
ALTER TABLE projects
DROP CONSTRAINT IF EXISTS projects_name_context_type_key;

-- Add new constraint: one project = one name
ALTER TABLE projects
ADD CONSTRAINT projects_name_unique UNIQUE(name);

-- ============================================
-- STEP 2: Clean up duplicate projects
-- ============================================

-- Keep only the most advanced phase for each project
-- Delete Manado negotiation (keep pre_opening)
DELETE FROM projects
WHERE name = 'Manado (Grand Kawanua)'
AND context_type = 'negotiation';

-- Delete Palembang negotiation (keep pre_opening)
DELETE FROM projects
WHERE name = 'Palembang (Transmart)'
AND context_type = 'negotiation';

-- ============================================
-- STEP 3: Add phase transition tracking
-- ============================================

-- Add field to track phase history
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS phase_history JSONB DEFAULT '[]';

-- Function to log phase transitions
CREATE OR REPLACE FUNCTION log_phase_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- If context_type changed, log the transition
  IF OLD.context_type IS DISTINCT FROM NEW.context_type THEN
    -- Add to phase history
    NEW.phase_history = COALESCE(NEW.phase_history, '[]'::jsonb) ||
      jsonb_build_object(
        'from', OLD.context_type,
        'to', NEW.context_type,
        'timestamp', NOW()
      );

    -- Log to updates_log
    INSERT INTO updates_log (project_id, update_type, summary, old_value, new_value, author)
    VALUES (
      NEW.id,
      'phase_transition',
      'Phase changed from ' || COALESCE(OLD.context_type, 'new') || ' to ' || NEW.context_type,
      to_jsonb(OLD.context_type),
      to_jsonb(NEW.context_type),
      'System'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for phase transitions
DROP TRIGGER IF EXISTS track_phase_transitions ON projects;
CREATE TRIGGER track_phase_transitions
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION log_phase_transition();

-- ============================================
-- STEP 4: Verify results
-- ============================================

SELECT
  name,
  context_type as current_phase,
  status,
  pic,
  created_at,
  updated_at
FROM projects
ORDER BY name;

SELECT 'Single project model applied! Each project now has one home.' as status;
