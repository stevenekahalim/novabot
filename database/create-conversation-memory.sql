-- Conversation Memory Table for Nova
-- Stores message history for conversation context

CREATE TABLE IF NOT EXISTS conversation_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id TEXT NOT NULL,  -- WhatsApp chat ID (group or private)
  chat_name TEXT,          -- Human-readable chat name
  chat_type TEXT NOT NULL, -- 'GROUP' or 'PRIVATE'

  message_timestamp TIMESTAMPTZ NOT NULL,
  message_text TEXT NOT NULL,
  message_author TEXT NOT NULL,

  -- Extracted context
  mentioned_project TEXT,  -- If message mentions a project
  classification_type TEXT, -- PROJECT_UPDATE, QUESTION, etc.

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- For 30-minute TTL

  -- Indexes for fast queries
  CONSTRAINT conversation_history_chat_id_idx
    CHECK (chat_id IS NOT NULL AND chat_id != '')
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_chat_id
  ON conversation_history(chat_id);

CREATE INDEX IF NOT EXISTS idx_conversation_timestamp
  ON conversation_history(message_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_expires
  ON conversation_history(expires_at)
  WHERE expires_at IS NOT NULL;

-- Create index for active conversations (not expired)
-- Note: Removed NOW() from predicate as it's not immutable
CREATE INDEX IF NOT EXISTS idx_conversation_active
  ON conversation_history(chat_id, message_timestamp DESC)
  WHERE expires_at IS NOT NULL;

COMMENT ON TABLE conversation_history IS
  'Stores recent message history for conversation context. Messages expire after 30 minutes of inactivity.';

COMMENT ON COLUMN conversation_history.expires_at IS
  'Messages older than this timestamp are considered expired and can be cleaned up.';

-- Function to clean up expired conversations (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_conversations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM conversation_history
  WHERE expires_at IS NOT NULL AND expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_conversations() IS
  'Deletes expired conversation history. Can be run via a cron job or manually.';
