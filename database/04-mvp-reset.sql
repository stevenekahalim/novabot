-- ============================================
-- NOVA MVP RESET - Simplified System
-- - Single-row per project (no duplicates)
-- - 5-item checklist (not 22)
-- - Fresh start
-- ============================================

-- ============================================
-- STEP 1: DROP ALL EXISTING TABLES
-- ============================================
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS updates_log CASCADE;
DROP TABLE IF EXISTS conversation_sessions CASCADE;
DROP TABLE IF EXISTS conversation_history CASCADE;
DROP TABLE IF EXISTS projects CASCADE;

-- ============================================
-- STEP 2: CREATE SIMPLIFIED SCHEMA
-- ============================================

-- CORE PROJECTS TABLE (Single Row Per Project)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,  -- ONE project = ONE row
  context_type TEXT NOT NULL CHECK (context_type IN ('negotiation', 'pre_opening', 'partnership', 'venture')),
  status TEXT,

  -- Flexible data storage (JSONB)
  data JSONB DEFAULT '{}',

  -- Common fields
  pic TEXT DEFAULT 'Eka',
  location TEXT,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),

  -- Quick reference
  next_action TEXT,
  deadline DATE,
  tags TEXT[]
);

-- Performance indexes
CREATE INDEX idx_projects_context ON projects(context_type);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_updated ON projects(updated_at DESC);
CREATE INDEX idx_projects_last_message ON projects(last_message_at DESC);
CREATE INDEX idx_projects_priority ON projects(priority);
CREATE INDEX idx_projects_deadline ON projects(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_projects_data ON projects USING GIN(data);
CREATE INDEX idx_projects_tags ON projects USING GIN(tags);

-- UPDATES LOG (Audit Trail)
CREATE TABLE updates_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- What changed
  update_type TEXT,
  old_value JSONB,
  new_value JSONB,
  summary TEXT,

  -- Metadata
  author TEXT,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_updates_project ON updates_log(project_id);
CREATE INDEX idx_updates_created ON updates_log(created_at DESC);
CREATE INDEX idx_updates_type ON updates_log(update_type);

-- CONVERSATION MEMORY (Sliding Window)
CREATE TABLE conversation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  chat_type TEXT,

  message_text TEXT NOT NULL,
  message_author TEXT NOT NULL,
  message_timestamp TIMESTAMPTZ DEFAULT NOW(),

  project_mentioned TEXT,
  classification TEXT,

  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversation_chat ON conversation_history(chat_id, message_timestamp DESC);
CREATE INDEX idx_conversation_expires ON conversation_history(expires_at DESC) WHERE expires_at IS NOT NULL;

-- CONVERSATION SESSIONS (for future summary feature)
CREATE TABLE conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  chat_name TEXT,

  session_start TIMESTAMPTZ NOT NULL,
  session_end TIMESTAMPTZ NOT NULL,

  summary_text TEXT,
  projects_discussed TEXT[],
  key_decisions TEXT[],
  message_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_chat ON conversation_sessions(chat_id, session_end DESC);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 3: SEED MVP DATA (One row per project)
-- ============================================

-- Manado - Currently in PRE_OPENING phase
INSERT INTO projects (name, context_type, status, location, pic, data, next_action, priority, tags) VALUES (
  'Manado (Grand Kawanua)',
  'pre_opening',
  'Legal Setup',
  'Manado, Grand Kawanua Mall',
  'Eka',
  '{
    "checklist": [
      {"item": "Sign rental agreement", "status": "pending", "phase": "Legal"},
      {"item": "Create PT/CV (Akta pendirian)", "status": "pending", "phase": "Legal"},
      {"item": "Open bank account", "status": "pending", "phase": "Legal"},
      {"item": "Hire architect/designer", "status": "pending", "phase": "Design"},
      {"item": "Select contractor", "status": "pending", "phase": "Construction"}
    ],
    "architect": "Ilalang Design",
    "architect_fee": 30000000,
    "opening_target": "2026-03-31"
  }'::jsonb,
  'Sign rental agreement & setup PT',
  'high',
  ARRAY['manado', 'pre-opening']
);

-- Palembang - Currently in PRE_OPENING phase
INSERT INTO projects (name, context_type, status, location, pic, data, next_action, priority, tags) VALUES (
  'Palembang (Transmart)',
  'pre_opening',
  'Legal Setup',
  'Palembang, Transmart',
  'Eka',
  '{
    "checklist": [
      {"item": "Sign rental agreement", "status": "pending", "phase": "Legal"},
      {"item": "Create PT/CV (Akta pendirian)", "status": "pending", "phase": "Legal"},
      {"item": "Open bank account", "status": "pending", "phase": "Legal"},
      {"item": "Hire architect/designer", "status": "pending", "phase": "Design"},
      {"item": "Select contractor", "status": "pending", "phase": "Construction"}
    ],
    "architect": "Ilalang Design",
    "architect_fee": 30000000,
    "opening_target": "2026-03-31"
  }'::jsonb,
  'Sign rental agreement & setup PT',
  'high',
  ARRAY['palembang', 'pre-opening']
);

-- Jakarta - New negotiation
INSERT INTO projects (name, context_type, status, location, pic, data, next_action, priority, tags) VALUES (
  'Jakarta (TBD)',
  'negotiation',
  'Location Scouting',
  'Jakarta',
  'Eka',
  '{
    "notes": "Looking for suitable Jakarta location"
  }'::jsonb,
  'Find suitable location options',
  'medium',
  ARRAY['jakarta', 'negotiation']
);

-- ============================================
-- VERIFICATION
-- ============================================

SELECT
  name,
  context_type,
  status,
  jsonb_array_length(data->'checklist') as checklist_size,
  pic
FROM projects
ORDER BY context_type, name;

SELECT '✅ MVP Database Reset Complete!' as status;
