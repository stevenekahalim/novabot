-- Conversation Sessions Table for Nova
-- Stores AI-generated summaries of conversation sessions

CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  chat_type TEXT NOT NULL, -- 'GROUP' or 'PRIVATE'

  -- Session timing
  session_start TIMESTAMPTZ NOT NULL,
  session_end TIMESTAMPTZ NOT NULL,
  message_count INTEGER DEFAULT 0,

  -- AI-generated summary
  summary_text TEXT,  -- Human-readable summary

  -- Structured data (JSONB for flexible querying)
  projects_discussed TEXT[],  -- Array of project names
  key_updates JSONB,   -- [{project, type, details}, ...]
  decisions JSONB,     -- [{decision, project, people}, ...]
  blockers JSONB,      -- [{blocker, project}, ...]
  people_involved TEXT[],

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- Keep for 30 days

  CONSTRAINT session_chat_id_check CHECK (chat_id IS NOT NULL AND chat_id != '')
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_session_chat_id
  ON conversation_sessions(chat_id);

CREATE INDEX IF NOT EXISTS idx_session_time
  ON conversation_sessions(chat_id, session_end DESC);

CREATE INDEX IF NOT EXISTS idx_session_expires
  ON conversation_sessions(expires_at)
  WHERE expires_at IS NOT NULL;

-- Index for project searches
CREATE INDEX IF NOT EXISTS idx_session_projects
  ON conversation_sessions USING GIN (projects_discussed);

COMMENT ON TABLE conversation_sessions IS
  'Stores AI-generated summaries of conversation sessions. Each session is a group of messages within a 10-minute window.';

COMMENT ON COLUMN conversation_sessions.summary_text IS
  'Human-readable summary of the session (2-3 sentences)';

COMMENT ON COLUMN conversation_sessions.key_updates IS
  'Structured updates: [{project: "Manado", type: "progress", details: "Design 80%"}, ...]';

-- Migration: Add session_id to conversation_history table
ALTER TABLE conversation_history
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES conversation_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_history_session
  ON conversation_history(session_id);

COMMENT ON COLUMN conversation_history.session_id IS
  'Links message to its session summary. NULL if session not yet summarized.';
