-- ============================================
-- NOVA V3 - FRESH START (Clean Database)
-- Wipes all V2 tables and creates simplified V3 schema
-- Generated: 2024-11-05
-- ============================================

-- ============================================
-- STEP 1: DROP ALL V2 TABLES
-- ============================================

-- Drop tables in correct order (dependencies first)
DROP TABLE IF EXISTS conversation_messages CASCADE;
DROP TABLE IF EXISTS conversation_sessions CASCADE;
DROP TABLE IF EXISTS conversation_daily_digests CASCADE;
DROP TABLE IF EXISTS project_facts CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS updates_log CASCADE;

-- Drop any remaining functions/triggers from V2
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================
-- STEP 2: CREATE V3 TABLES (Simplified Schema)
-- ============================================

-- ============================================
-- TABLE: messages_v3
-- Purpose: Store raw messages with minimal extraction
-- Philosophy: Let ChatGPT infer, don't pre-structure
-- ============================================
CREATE TABLE messages_v3 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core message data
  message_text TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_number TEXT,
  chat_id TEXT NOT NULL,
  chat_name TEXT,

  -- Timestamps
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Minimal metadata
  mentioned_nova BOOLEAN DEFAULT false,
  is_reply BOOLEAN DEFAULT false,
  replied_to_msg_id TEXT,

  -- Media tracking (optional)
  has_media BOOLEAN DEFAULT false,
  media_type TEXT,

  -- Indexing for fast queries
  CONSTRAINT messages_v3_timestamp_check CHECK (timestamp IS NOT NULL)
);

-- Indexes for fast context loading
CREATE INDEX idx_messages_v3_chat_timestamp ON messages_v3(chat_id, timestamp DESC);
CREATE INDEX idx_messages_v3_mentioned_nova ON messages_v3(chat_id, mentioned_nova) WHERE mentioned_nova = true;
CREATE INDEX idx_messages_v3_sender ON messages_v3(sender_name, timestamp DESC);

-- ============================================
-- TABLE: hourly_notes
-- Purpose: AI-generated meeting notes every hour
-- Philosophy: Less intrusive than per-message responses
-- ============================================
CREATE TABLE hourly_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  hour_timestamp TIMESTAMPTZ NOT NULL,

  -- AI-generated summary
  summary_text TEXT NOT NULL,
  key_decisions TEXT[], -- Array of key decisions made
  action_items TEXT[], -- Array of action items identified

  -- Metadata
  message_count INTEGER NOT NULL DEFAULT 0,
  participants TEXT[], -- Who was active this hour

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT hourly_notes_unique UNIQUE (chat_id, hour_timestamp)
);

-- Indexes
CREATE INDEX idx_hourly_notes_chat_time ON hourly_notes(chat_id, hour_timestamp DESC);
CREATE INDEX idx_hourly_notes_created ON hourly_notes(created_at DESC);

-- ============================================
-- TABLE: daily_digests_v3
-- Purpose: End-of-day comprehensive summaries
-- Philosophy: Saved at midnight, provides 30-day memory
-- ============================================
CREATE TABLE daily_digests_v3 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  digest_date DATE NOT NULL,

  -- AI-generated comprehensive summary
  summary_text TEXT NOT NULL,

  -- Structured insights
  projects_discussed TEXT[], -- Which projects were mentioned
  key_decisions TEXT[], -- Major decisions made
  blockers_identified TEXT[], -- Issues that need attention
  financial_mentions JSONB, -- Any money amounts mentioned

  -- Activity metrics
  message_count INTEGER NOT NULL DEFAULT 0,
  participants TEXT[],
  most_active_participant TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT daily_digests_v3_unique UNIQUE (chat_id, digest_date)
);

-- Indexes
CREATE INDEX idx_daily_digests_v3_chat_date ON daily_digests_v3(chat_id, digest_date DESC);
CREATE INDEX idx_daily_digests_v3_projects ON daily_digests_v3 USING GIN(projects_discussed);
CREATE INDEX idx_daily_digests_v3_created ON daily_digests_v3(created_at DESC);

-- ============================================
-- STEP 3: CREATE HELPER FUNCTIONS
-- ============================================

-- Function to get recent context (used by contextLoader.js)
CREATE OR REPLACE FUNCTION get_recent_context(
  p_chat_id TEXT,
  p_message_limit INTEGER DEFAULT 100,
  p_days_back INTEGER DEFAULT 7
)
RETURNS TABLE(
  recent_messages JSONB,
  hourly_notes JSONB,
  daily_digests JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Recent messages
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'sender', sender_name,
          'text', message_text,
          'timestamp', timestamp,
          'mentioned_nova', mentioned_nova
        ) ORDER BY timestamp ASC
      )
      FROM (
        SELECT * FROM messages_v3
        WHERE chat_id = p_chat_id
          AND timestamp > NOW() - (p_days_back || ' days')::INTERVAL
        ORDER BY timestamp DESC
        LIMIT p_message_limit
      ) recent
    ) AS recent_messages,

    -- Last 24 hours of hourly notes
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'hour', hour_timestamp,
          'summary', summary_text,
          'decisions', key_decisions,
          'actions', action_items
        ) ORDER BY hour_timestamp DESC
      )
      FROM hourly_notes
      WHERE chat_id = p_chat_id
        AND hour_timestamp > NOW() - INTERVAL '24 hours'
    ) AS hourly_notes,

    -- Last 30 days of daily digests
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', digest_date,
          'summary', summary_text,
          'projects', projects_discussed,
          'decisions', key_decisions,
          'blockers', blockers_identified
        ) ORDER BY digest_date DESC
      )
      FROM daily_digests_v3
      WHERE chat_id = p_chat_id
        AND digest_date > CURRENT_DATE - 30
    ) AS daily_digests;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 4: VERIFICATION QUERIES
-- ============================================

-- Verify all V2 tables are dropped
DO $$
DECLARE
  v2_tables TEXT[] := ARRAY[
    'conversation_messages',
    'conversation_sessions',
    'conversation_daily_digests',
    'project_facts',
    'projects',
    'updates_log'
  ];
  tbl_name TEXT;
BEGIN
  FOREACH tbl_name IN ARRAY v2_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = tbl_name
    ) THEN
      RAISE EXCEPTION 'V2 table % still exists!', tbl_name;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ All V2 tables successfully dropped';
END $$;

-- Verify all V3 tables are created
DO $$
DECLARE
  v3_tables TEXT[] := ARRAY[
    'messages_v3',
    'hourly_notes',
    'daily_digests_v3'
  ];
  tbl_name TEXT;
BEGIN
  FOREACH tbl_name IN ARRAY v3_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = tbl_name
    ) THEN
      RAISE EXCEPTION 'V3 table % was not created!', tbl_name;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ All V3 tables successfully created';
END $$;

-- ============================================
-- SUMMARY
-- ============================================

SELECT
  '✅ NOVA V3 DATABASE READY' AS status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') AS total_tables,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') AS total_indexes;

-- Show created tables
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
