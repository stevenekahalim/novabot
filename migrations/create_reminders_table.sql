-- Create reminders table for Nova's reminder system
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to TEXT NOT NULL,
  reminder_date DATE NOT NULL,
  reminder_time TIME DEFAULT '09:00:00',
  message TEXT NOT NULL,
  created_by TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reminders_status_date ON reminders(status, reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_assigned_to ON reminders(assigned_to);

-- Comment
COMMENT ON TABLE reminders IS 'Stores reminder requests for Nova AI assistant';
