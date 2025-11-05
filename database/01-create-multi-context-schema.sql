-- ============================================
-- NOVA MULTI-CONTEXT DATABASE SCHEMA
-- Version: 2.0 - Multi-Context Support
-- Created: November 4, 2025
-- ============================================

-- Drop existing tables if migrating
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS updates_log CASCADE;
DROP TABLE IF EXISTS project_updates CASCADE;
DROP TABLE IF EXISTS projects CASCADE;

-- ============================================
-- CORE PROJECTS TABLE (All Contexts)
-- ============================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  context_type TEXT NOT NULL CHECK (context_type IN ('negotiation', 'pre_opening', 'partnership', 'venture')),
  status TEXT,

  -- Flexible data storage per context (JSONB for flexibility)
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
  tags TEXT[],

  -- Same project can exist in multiple contexts (e.g., Manado in negotiation + pre_opening)
  UNIQUE(name, context_type)
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
CREATE INDEX idx_projects_name ON projects(name);

-- ============================================
-- UPDATES LOG (Audit Trail)
-- ============================================
CREATE TABLE updates_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- What changed
  update_type TEXT,  -- 'status_change', 'data_update', 'file_added', 'note', 'milestone', etc.
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

-- ============================================
-- FILES & DOCUMENTS
-- ============================================
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- File info
  filename TEXT NOT NULL,
  file_type TEXT,  -- 'pdf', 'jpg', 'vcf', 'xlsx', etc.
  category TEXT,   -- 'proposal', 'contract', 'layout', 'financial_model', 'contact', etc.
  storage_url TEXT,
  file_size_bytes BIGINT,

  -- Context
  description TEXT,
  tags TEXT[],
  extracted_data JSONB,  -- AI-extracted data from file

  -- Metadata
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  whatsapp_message_id TEXT
);

CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_category ON files(category);
CREATE INDEX idx_files_uploaded ON files(uploaded_at DESC);
CREATE INDEX idx_files_tags ON files USING GIN(tags);
CREATE INDEX idx_files_type ON files(file_type);

-- ============================================
-- CONTACTS (for .vcf management)
-- ============================================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact info
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  company TEXT,
  role TEXT,

  -- Relations
  related_projects UUID[],  -- Array of project IDs
  tags TEXT[],
  notes TEXT,

  -- Source
  vcf_file_id UUID REFERENCES files(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_name ON contacts(name);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_company ON contacts(company);
CREATE INDEX idx_contacts_projects ON contacts USING GIN(related_projects);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);

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

-- Function to get projects by context
CREATE OR REPLACE FUNCTION get_projects_by_context(p_context_type TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  status TEXT,
  data JSONB,
  priority TEXT,
  next_action TEXT,
  deadline DATE,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.status, p.data, p.priority,
    p.next_action, p.deadline, p.updated_at
  FROM projects p
  WHERE p.context_type = p_context_type
  ORDER BY
    CASE p.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
      ELSE 5
    END,
    p.updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get stale projects (no update in N days)
CREATE OR REPLACE FUNCTION get_stale_projects(days_threshold INTEGER DEFAULT 5)
RETURNS TABLE (
  id UUID,
  name TEXT,
  context_type TEXT,
  days_since_update INTEGER,
  last_update TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.context_type,
    EXTRACT(DAY FROM (NOW() - p.last_message_at))::INTEGER as days_since_update,
    p.last_message_at as last_update
  FROM projects p
  WHERE p.last_message_at < NOW() - (days_threshold || ' days')::INTERVAL
  ORDER BY p.last_message_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get urgent projects (deadline approaching)
CREATE OR REPLACE FUNCTION get_urgent_projects(days_ahead INTEGER DEFAULT 3)
RETURNS TABLE (
  id UUID,
  name TEXT,
  context_type TEXT,
  deadline DATE,
  days_until_deadline INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.context_type,
    p.deadline,
    (p.deadline - CURRENT_DATE)::INTEGER as days_until_deadline
  FROM projects p
  WHERE p.deadline IS NOT NULL
    AND p.deadline <= CURRENT_DATE + (days_ahead || ' days')::INTERVAL
    AND p.deadline >= CURRENT_DATE
  ORDER BY p.deadline ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

-- Active projects by context
CREATE OR REPLACE VIEW v_projects_by_context AS
SELECT
  context_type,
  COUNT(*) as project_count,
  COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_count,
  COUNT(*) FILTER (WHERE priority = 'high') as high_count,
  COUNT(*) FILTER (WHERE deadline IS NOT NULL AND deadline < CURRENT_DATE + INTERVAL '7 days') as deadline_approaching
FROM projects
GROUP BY context_type;

-- Recent activity
CREATE OR REPLACE VIEW v_recent_activity AS
SELECT
  p.name as project_name,
  p.context_type,
  u.summary,
  u.author,
  u.created_at
FROM updates_log u
JOIN projects p ON u.project_id = p.id
ORDER BY u.created_at DESC
LIMIT 50;

-- ============================================
-- GRANT PERMISSIONS (adjust as needed)
-- ============================================

-- Grant access to authenticated users (Supabase RLS will handle fine-grained access)
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE updates_log ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE files ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- For now, keep open for development
-- CREATE POLICY "Enable all access for authenticated users" ON projects FOR ALL USING (true);

-- ============================================
-- SCHEMA READY
-- ============================================
SELECT 'Multi-context schema created successfully!' as status;
