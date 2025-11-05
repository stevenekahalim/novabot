-- ============================================
-- ENHANCED CONTEXT MEMORY ARCHITECTURE
-- Data Quality First - Zero Data Loss System
-- ============================================

-- ============================================
-- LAYER 1: RAW MESSAGES (Permanent Archive)
-- ============================================

-- Drop old conversation_history if it exists
DROP TABLE IF EXISTS conversation_history CASCADE;

-- Create enhanced conversation_messages table
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core message data
  message_text TEXT NOT NULL,
  sender TEXT NOT NULL,
  sender_number TEXT,
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Rich extraction (comprehensive AI analysis)
  projects_mentioned TEXT[],
  people_mentioned TEXT[],
  numbers_extracted JSONB,
  /* Structure:
  [
    {type: "amount", value: 21000000, context: "DP for architect", currency: "IDR"},
    {type: "percentage", value: 30, context: "grace period discount"},
    {type: "quantity", value: 2, context: "months grace period"}
  ]
  */

  dates_extracted JSONB,
  /* Structure:
  [
    {type: "deadline", value: "2026-03-31", context: "opening target"},
    {type: "meeting", value: "2025-11-10", context: "architect discussion"}
  ]
  */

  decisions_detected TEXT[],
  questions_detected TEXT[],
  action_items_detected TEXT[],
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'urgent')),

  -- Context understanding
  project_context TEXT,
  conversation_phase TEXT,  -- greeting, update, question, decision, closing

  -- Classification
  intent TEXT,  -- update, status_query, question, decision, reminder
  context_type TEXT CHECK (context_type IN ('negotiation', 'pre_opening', 'partnership', 'venture')),
  confidence FLOAT,

  -- Metadata
  whatsapp_message_id TEXT UNIQUE,
  processed BOOLEAN DEFAULT false,
  session_id UUID,  -- Will be linked after session compilation

  -- Never expires, never deleted
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for Layer 1
CREATE INDEX idx_messages_timestamp ON conversation_messages(timestamp DESC);
CREATE INDEX idx_messages_chat ON conversation_messages(chat_id, timestamp DESC);
CREATE INDEX idx_messages_project ON conversation_messages(project_context) WHERE project_context IS NOT NULL;
CREATE INDEX idx_messages_sender ON conversation_messages(sender);
CREATE INDEX idx_messages_session ON conversation_messages(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_messages_intent ON conversation_messages(intent) WHERE intent IS NOT NULL;
CREATE INDEX idx_messages_unprocessed ON conversation_messages(chat_id, timestamp DESC) WHERE processed = false;
CREATE INDEX idx_messages_projects_mentioned ON conversation_messages USING GIN(projects_mentioned);
CREATE INDEX idx_messages_numbers ON conversation_messages USING GIN(numbers_extracted);

-- ============================================
-- LAYER 2: CONVERSATION SESSIONS (Natural Boundaries)
-- ============================================

-- Drop and recreate with enhanced structure
DROP TABLE IF EXISTS conversation_sessions CASCADE;

CREATE TABLE conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session metadata
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  chat_type TEXT,
  session_start TIMESTAMPTZ NOT NULL,
  session_end TIMESTAMPTZ NOT NULL,
  message_count INTEGER DEFAULT 0,

  -- AI-compiled summary
  summary_text TEXT,

  -- Structured extraction
  projects_discussed TEXT[],

  decisions_made JSONB[],
  /* Structure:
  {
    decision: "Go with option A for Manado",
    project: "Manado",
    timestamp: "2025-01-15T10:30:00Z",
    decided_by: ["Eka", "Architect"],
    confidence: 0.9,
    source_message_ids: ["uuid1", "uuid2"]
  }
  */

  updates_made JSONB[],
  /* Structure:
  {
    project: "Manado",
    update_type: "checklist_item",
    item: "PT completed",
    old_value: "pending",
    new_value: "done",
    timestamp: "2025-01-15T10:30:00Z",
    source_message_ids: ["uuid1"]
  }
  */

  questions_asked JSONB[],
  /* Structure:
  {
    question: "When is the architect meeting?",
    asked_by: "Eka",
    project: "Manado",
    answered: true,
    answer: "Tomorrow at 2 PM",
    source_message_ids: ["uuid1", "uuid2"]
  }
  */

  action_items JSONB[],
  /* Structure:
  {
    action: "Call architect to confirm meeting",
    assigned_to: "Eka",
    project: "Manado",
    due_date: "2025-11-06",
    priority: "high",
    completed: false,
    source_message_ids: ["uuid1"]
  }
  */

  blockers_identified JSONB[],
  /* Structure:
  {
    blocker: "Waiting for rental agreement signature",
    project: "Manado",
    severity: "high",
    identified_at: "2025-01-15T10:30:00Z",
    source_message_ids: ["uuid1"]
  }
  */

  numbers_discussed JSONB[],
  /* Structure:
  {
    type: "cost",
    value: 21000000,
    context: "DP for architect",
    project: "Manado",
    source_message_ids: ["uuid1"]
  }
  */

  people_involved TEXT[],

  -- Session context
  primary_project TEXT,
  primary_context_type TEXT,
  session_type TEXT,  -- focused, multi-project, casual, status_check
  overall_sentiment TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for Layer 2
CREATE INDEX idx_sessions_chat ON conversation_sessions(chat_id, session_end DESC);
CREATE INDEX idx_sessions_project ON conversation_sessions(primary_project) WHERE primary_project IS NOT NULL;
CREATE INDEX idx_sessions_end ON conversation_sessions(session_end DESC);
CREATE INDEX idx_sessions_projects ON conversation_sessions USING GIN(projects_discussed);
CREATE INDEX idx_sessions_start_range ON conversation_sessions(session_start);

-- Add foreign key constraint after both tables exist
ALTER TABLE conversation_messages
  ADD CONSTRAINT fk_messages_session
  FOREIGN KEY (session_id)
  REFERENCES conversation_sessions(id)
  ON DELETE SET NULL;

-- ============================================
-- LAYER 3: DAILY DIGESTS (Rollup Summaries)
-- ============================================

CREATE TABLE conversation_daily_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  date DATE NOT NULL UNIQUE,

  -- Per-project summaries
  project_summaries JSONB,
  /* Structure:
  {
    "Manado": {
      sessions: 3,
      messages: 45,
      key_updates: [
        {type: "checklist", item: "PT completed", timestamp: "..."},
        {type: "cost", item: "DP 21jt paid", timestamp: "..."}
      ],
      decisions: [...],
      blockers: [...],
      participants: ["Eka", "Architect"],
      sentiment: "positive",
      progress_made: true,
      next_actions: [...]
    }
  }
  */

  -- Global summary
  total_sessions INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  active_projects TEXT[],

  key_decisions JSONB[],
  action_items JSONB[],
  blockers JSONB[],

  -- Overall insights
  daily_summary TEXT,
  productivity_score INTEGER,  -- 1-10 scale
  issues_detected INTEGER DEFAULT 0,

  -- Links to source data
  session_ids UUID[],

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for Layer 3
CREATE INDEX idx_digests_date ON conversation_daily_digests(date DESC);
CREATE INDEX idx_digests_projects ON conversation_daily_digests USING GIN(active_projects);

-- ============================================
-- LAYER 4: PROJECT FACTS (Structured Knowledge)
-- ============================================

CREATE TABLE project_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fact identification
  project_name TEXT NOT NULL,
  fact_type TEXT NOT NULL,  -- decision, cost, date, person, status, technical, legal
  fact_category TEXT,       -- financial, timeline, people, legal, technical, operational

  -- Fact content
  fact_text TEXT NOT NULL,
  fact_data JSONB,
  /* Structure varies by type:

  For "cost":
  {
    amount: 21000000,
    currency: "IDR",
    category: "design",
    paid: true,
    payment_date: "2025-11-05"
  }

  For "date":
  {
    date: "2026-03-31",
    event: "opening target",
    confirmed: false
  }

  For "person":
  {
    name: "Ilalang Design",
    role: "architect",
    contact: "+62xxx"
  }
  */

  -- Full provenance (audit trail)
  source_message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL,
  source_session_id UUID REFERENCES conversation_sessions(id) ON DELETE SET NULL,
  stated_by TEXT,
  stated_at TIMESTAMPTZ,

  -- Validation and confidence
  confidence FLOAT DEFAULT 1.0,
  validated BOOLEAN DEFAULT false,
  validated_by TEXT,
  validated_at TIMESTAMPTZ,

  -- Fact lifecycle
  active BOOLEAN DEFAULT true,
  superseded_by UUID REFERENCES project_facts(id) ON DELETE SET NULL,
  superseded_at TIMESTAMPTZ,

  -- Context
  project_phase TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for Layer 4
CREATE INDEX idx_facts_project ON project_facts(project_name, created_at DESC);
CREATE INDEX idx_facts_type ON project_facts(fact_type);
CREATE INDEX idx_facts_category ON project_facts(fact_category) WHERE fact_category IS NOT NULL;
CREATE INDEX idx_facts_source_msg ON project_facts(source_message_id) WHERE source_message_id IS NOT NULL;
CREATE INDEX idx_facts_source_session ON project_facts(source_session_id) WHERE source_session_id IS NOT NULL;
CREATE INDEX idx_facts_active ON project_facts(project_name, active, created_at DESC) WHERE active = true;
CREATE INDEX idx_facts_data ON project_facts USING GIN(fact_data);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Auto-update updated_at for facts
CREATE OR REPLACE FUNCTION update_fact_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_facts_updated_at
  BEFORE UPDATE ON project_facts
  FOR EACH ROW
  EXECUTE FUNCTION update_fact_updated_at();

-- Function to find idle sessions (for session compilation)
CREATE OR REPLACE FUNCTION find_idle_sessions(idle_minutes INTEGER)
RETURNS TABLE(chat_id TEXT, last_message_time TIMESTAMPTZ, message_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.chat_id,
    MAX(m.timestamp) as last_message_time,
    COUNT(*) as message_count
  FROM conversation_messages m
  WHERE
    m.processed = false
    AND m.timestamp < NOW() - (idle_minutes || ' minutes')::INTERVAL
  GROUP BY m.chat_id
  HAVING COUNT(*) > 0
  ORDER BY MAX(m.timestamp) DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DATA MIGRATION (from old structure if exists)
-- ============================================

-- Note: If you have data in old conversation_history table,
-- run a custom migration script to preserve it

-- ============================================
-- VERIFICATION
-- ============================================

SELECT
  'conversation_messages' as table_name,
  COUNT(*) as row_count
FROM conversation_messages
UNION ALL
SELECT
  'conversation_sessions' as table_name,
  COUNT(*) as row_count
FROM conversation_sessions
UNION ALL
SELECT
  'conversation_daily_digests' as table_name,
  COUNT(*) as row_count
FROM conversation_daily_digests
UNION ALL
SELECT
  'project_facts' as table_name,
  COUNT(*) as row_count
FROM project_facts;

SELECT '✅ Enhanced Context Memory Schema Created!' as status;
