-- V4 "Silent Observer" Database Tables
-- Created: 2025-11-20
-- Purpose: Support message buffering and router decisions

-- Table 1: Message Buffer
-- Stores messages waiting for 15s silence window before processing
CREATE TABLE IF NOT EXISTS message_buffer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT UNIQUE NOT NULL,
  chat_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  message_text TEXT NOT NULL,
  buffer_timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Router decision tracking
  action_decided TEXT CHECK (action_decided IN ('ignore', 'pass', 'pending')),
  router_confidence NUMERIC(3,2),
  router_reason TEXT,

  -- Processing status
  processed_at TIMESTAMPTZ,
  processed_result TEXT, -- 'ignored', 'responded', 'reminded', 'silent'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buffer_chat_timestamp ON message_buffer(chat_id, buffer_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_buffer_processed ON message_buffer(processed_at) WHERE processed_at IS NULL;

-- Table 2: Router Decisions Audit Log
-- Tracks every routing decision for monitoring and optimization
CREATE TABLE IF NOT EXISTS router_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  message_text TEXT NOT NULL,
  chat_id TEXT NOT NULL,

  -- Decision details
  action TEXT NOT NULL CHECK (action IN ('ignore', 'pass')),
  confidence NUMERIC(3,2) NOT NULL,
  reason TEXT NOT NULL,

  -- Metadata
  was_mentioned BOOLEAN DEFAULT false,
  heuristic_used BOOLEAN DEFAULT false, -- true if decided by heuristic, false if AI

  -- Cost tracking
  model_used TEXT DEFAULT 'gpt-4o-mini',
  tokens_used INTEGER,
  cost NUMERIC(10,8),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_router_decisions_created ON router_decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_router_decisions_action ON router_decisions(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_router_decisions_chat ON router_decisions(chat_id, created_at DESC);

-- Table 3: Router Performance Stats (Optional - for monitoring)
CREATE TABLE IF NOT EXISTS router_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,

  -- Counts
  total_messages INTEGER DEFAULT 0,
  ignored_count INTEGER DEFAULT 0,
  passed_count INTEGER DEFAULT 0,
  heuristic_count INTEGER DEFAULT 0,
  ai_count INTEGER DEFAULT 0,

  -- Costs
  total_cost NUMERIC(10,6) DEFAULT 0,
  avg_cost_per_message NUMERIC(10,8),

  -- Accuracy (will be updated manually based on feedback)
  false_positives INTEGER DEFAULT 0, -- Ignored but should have passed
  false_negatives INTEGER DEFAULT 0, -- Passed but should have ignored

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_router_stats_date ON router_stats(date DESC);

-- Comments for documentation
COMMENT ON TABLE message_buffer IS 'V4: Buffers messages for 15s debounce before processing';
COMMENT ON TABLE router_decisions IS 'V4: Audit log of all routing decisions (PASS/IGNORE)';
COMMENT ON TABLE router_stats IS 'V4: Daily aggregated statistics for router performance monitoring';

COMMENT ON COLUMN message_buffer.action_decided IS 'Router decision: ignore (stop), pass (continue to Nova), pending (waiting)';
COMMENT ON COLUMN router_decisions.heuristic_used IS 'true = decided by free heuristics, false = decided by GPT-4o-mini';
COMMENT ON COLUMN router_decisions.cost IS 'Cost in USD for this routing decision';
