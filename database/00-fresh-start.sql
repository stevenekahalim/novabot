-- ============================================
-- NOVA FRESH START - Multi-Context System
-- This will ERASE all existing Nova data and create new schema
-- Created: November 4, 2025
-- ============================================

-- ============================================
-- STEP 1: DROP ALL EXISTING TABLES
-- ============================================
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS updates_log CASCADE;
DROP TABLE IF EXISTS project_updates CASCADE;
DROP TABLE IF EXISTS conversation_sessions CASCADE;
DROP TABLE IF EXISTS conversation_history CASCADE;
DROP TABLE IF EXISTS projects CASCADE;

-- ============================================
-- STEP 2: CREATE NEW MULTI-CONTEXT SCHEMA
-- ============================================

-- CORE PROJECTS TABLE (All Contexts)
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

-- UPDATES LOG (Audit Trail)
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

-- FILES & DOCUMENTS
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

-- CONTACTS (for .vcf management)
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
CREATE INDEX idx_conversation_active ON conversation_history(chat_id, message_timestamp DESC) WHERE expires_at IS NOT NULL;

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
-- STEP 3: SEED INITIAL PROJECTS FROM WHATSAPP
-- ============================================

-- NEGOTIATION CONTEXT PROJECTS

-- Manado (Transmart/Grand Kawanua) - Negotiation Phase
INSERT INTO projects (name, context_type, status, location, pic, data, next_action, priority, tags, created_at, updated_at) VALUES (
  'Manado (Grand Kawanua)',
  'negotiation',
  'Payment Terms Discussion',
  'Manado, Grand Kawanua Mall',
  'Hendry',
  '{
    "venue_name": "Grand Kawanua Mall (ex-Transmart)",
    "offer_details": "Mall rooftop location, Manado Utara development area",
    "location_notes": "Strategic location near airport, new development direction",
    "payment_terms": "Being finalized",
    "key_contacts": ["Pak Erwin - Transmart Manado"],
    "decision_deadline": "2025-11-15",
    "competitors": ["Paddle King - planning Grand Kawanua location"],
    "status_notes": "Payment finalization in progress, investor local requirement"
  }'::jsonb,
  'Finalize payment terms dengan Pak Erwin',
  'high',
  ARRAY['transmart', 'manado', 'rooftop', 'payment-pending'],
  '2025-09-10 21:21:00',
  '2025-11-04 12:00:00'
);

-- Palembang (Transmart) - Negotiation Phase
INSERT INTO projects (name, context_type, status, location, pic, data, next_action, priority, tags, created_at, updated_at) VALUES (
  'Palembang (Transmart)',
  'negotiation',
  'Payment Structure Nego',
  'Palembang, Transmart',
  'Hendry',
  '{
    "venue_name": "Transmart Palembang",
    "offer_details": "Multiple location package (3-4 locations)",
    "payment_options": [
      "Option 1: Per tahun (if Palembang only)",
      "Option 2: Per 3 bulan (if package 3-4 locations)"
    ],
    "payment_terms": "Negotiating quarterly vs yearly",
    "grace_period_months": 3,
    "grace_period_options": "3 months GP + 1 year upfront OR monthly no GP",
    "tenant_context": "11 tenants dengan harga khusus, diminta bayar 1 tahun depan",
    "location_advantage": "No pillars in original layout (confirmed by Edbert)",
    "related_entity": "Graha Padel Club (existing tenant)"
  }'::jsonb,
  'Decide payment structure: quarterly package vs yearly single',
  'high',
  ARRAY['transmart', 'palembang', 'payment-negotiation', 'grace-period'],
  '2025-10-20 12:27:00',
  '2025-10-31 11:39:00'
);

-- PRE-OPENING CONTEXT PROJECTS

-- Manado - Pre-Opening / Design Phase
INSERT INTO projects (name, context_type, status, location, pic, data, next_action, deadline, priority, tags, created_at, updated_at) VALUES (
  'Manado (Grand Kawanua)',
  'pre_opening',
  'Design Phase',
  'Manado, Grand Kawanua Mall',
  'Win',
  '{
    "architect": "Ilalang Design",
    "architect_fee": 30000000,
    "architect_notes": "Has existing padel project (Padel Garden), prefers commission for build, expensive for design-only",
    "design_scope": "Layout, MEP, working drawings, KBH",
    "design_status": "Proposal received, price negotiation",
    "design_reference": "Similar to Palembang design",
    "opening_target": "Q1 2026",
    "checklist": [
      {"item": "Architect selection", "status": "in_progress", "notes": "Ilalang 30M quoted"},
      {"item": "Design finalization", "status": "pending"},
      {"item": "Construction planning", "status": "pending"},
      {"item": "Equipment ordering", "status": "pending"}
    ]
  }'::jsonb,
  'Negotiate architect fee dengan Ilalang, consider design+build package',
  '2025-12-31',
  'high',
  ARRAY['design-phase', 'architect-selection', 'manado'],
  '2025-11-02 12:09:00',
  '2025-11-02 12:09:00'
);

-- Palembang - Pre-Opening / Design Phase
INSERT INTO projects (name, context_type, status, location, pic, data, next_action, deadline, priority, tags, created_at, updated_at) VALUES (
  'Palembang (Transmart)',
  'pre_opening',
  'Design Phase',
  'Palembang, Transmart',
  'Win',
  '{
    "architect": "Ilalang Design",
    "architect_fee": 30000000,
    "design_scope": "Layout, MEP, working drawings, KBH",
    "design_status": "Final price received",
    "design_files": [
      "Lingkup Kerja dan Fee (Padel Palembang).pdf"
    ],
    "opening_target": "Q1 2026",
    "checklist": [
      {"item": "Design proposal approved", "status": "done"},
      {"item": "Contract signing", "status": "pending"},
      {"item": "Design execution", "status": "pending"},
      {"item": "Construction planning", "status": "pending"}
    ],
    "related_venue": "Graha Padel Club (operating)"
  }'::jsonb,
  'Approve final design price, sign architect contract',
  '2025-12-31',
  'high',
  ARRAY['design-phase', 'palembang', 'contract-pending'],
  '2025-11-02 12:09:00',
  '2025-11-02 12:09:00'
);

-- PARTNERSHIP CONTEXT PROJECTS

-- Graha Padel Club - Operating Partnership
INSERT INTO projects (name, context_type, status, location, pic, data, next_action, priority, tags, created_at, updated_at) VALUES (
  'Graha Padel Club',
  'partnership',
  'Operating - Management Review',
  'Palembang, Transmart',
  'Eka',
  '{
    "partner_name": "Graha Padel Club",
    "venue_type": "Operating padel venue",
    "deal_type": "Management & Operations",
    "location_details": "Transmart Palembang",
    "current_management": "Discussing management options",
    "management_candidates": ["Daddies", "HTS", "Alma"],
    "financial_docs": [
      "Graha_Padel_Club_Palembang_Financial_Statement.pdf (27 pages)",
      "SURAT KESEPAKATAN SEWA TRANSMART PALEMBANG_GRAHA PADEL.pdf (11 pages)"
    ],
    "concerns": ["Occupancy dropping", "Management effectiveness"],
    "contract_status": "Rental agreement signed with Transmart",
    "revenue_share": "To be determined based on management selection"
  }'::jsonb,
  'Evaluate management performance, decide on management structure',
  'medium',
  ARRAY['operating', 'palembang', 'management-review', 'graha'],
  '2025-10-16 10:27:00',
  '2025-11-04 14:18:00'
);

-- Daddies Management Partnership
INSERT INTO projects (name, context_type, status, location, pic, data, next_action, priority, tags, created_at, updated_at) VALUES (
  'Daddies Management Partnership',
  'partnership',
  'Under Review',
  'Multiple Locations',
  'Eka',
  '{
    "partner_name": "Daddies Padel",
    "deal_type": "Management Services Agreement",
    "revenue_share": "6% management fee structure",
    "fee_structure": {
      "total": "6%",
      "breakdown": {
        "pic_daddies": "2%",
        "daddies_group": "4%"
      }
    },
    "management_model": "1 Senior Daddies oversees 2-3 projects, each with 1 fulltime manager",
    "agreed_terms": [
      "6% management fee split (2% PIC + 4% Group)",
      "Senior Daddies as project head",
      "Hiring fulltime managers per location"
    ],
    "pending_issues": [
      "No fulltime dedicated staff currently",
      "Need to hire fulltime managers",
      "Effectiveness concerns vs competitors (HTS, Alma)"
    ],
    "venues_discussed": ["Graha Padel", "Future Manado", "Future Palembang"],
    "alternative_options": ["HTS (looking for people)", "Alma (better than Daddies?)"],
    "pbpi_opportunity": "Hendy Daddies offered PBPI events position"
  }'::jsonb,
  'Compare Daddies vs HTS vs Alma for management, decide structure',
  'high',
  ARRAY['management', 'partnership', 'daddies', 'decision-needed'],
  '2025-08-21 09:51:00',
  '2025-11-04 14:14:00'
);

-- VENTURE CONTEXT PROJECTS

-- CariSponsorPadel.com
INSERT INTO projects (name, context_type, status, location, pic, data, next_action, priority, tags, created_at, updated_at) VALUES (
  'CariSponsorPadel.com',
  'venture',
  'MVP Development',
  'Digital Platform',
  'Eka',
  '{
    "business_model": "Two-sided marketplace connecting padel venues/events with brand sponsors",
    "tagline": "Airbnb for padel sponsorships",
    "revenue_model": {
      "primary": "10-20% commission on closed deals",
      "secondary": "3M flat fee for professional proposal service",
      "future": "Bundle deals with 10-15% markup"
    },
    "value_proposition": {
      "for_venues": "Connect traffic to sponsors without knowing how",
      "for_brands": "Easy entry to padel market with curated opportunities"
    },
    "current_phase": "Website launched",
    "website": "www.carisponsorpadel.com",
    "supply_side": {
      "model": "Free submission, 10-20% commission on close",
      "optional_service": "3M professional proposal",
      "target": "Venues, tournaments, communities"
    },
    "demand_side": {
      "model": "Browse opportunities, free inquiry",
      "incentive": "Bundle deals 30-50% discount",
      "target": "Brands wanting padel exposure"
    },
    "go_to_market": {
      "phase_1": "Populate with existing deals (Graha, Transmart locations)",
      "phase_2": "Onboard 20-30 venues/events",
      "phase_3": "Build brand trust via case studies"
    },
    "competitive_edge": [
      "First mover in Indonesia",
      "Quality control (curated opportunities)",
      "Eka network & credibility",
      "Speed (APEXCON pre-opening proposals)"
    ],
    "milestones": [
      {"milestone": "Website launch", "status": "done", "date": "2025-11-03"},
      {"milestone": "Seed with 3-5 initial opportunities", "status": "in_progress"},
      {"milestone": "First brand inquiry", "status": "pending"},
      {"milestone": "First commission earned", "status": "pending"}
    ],
    "decision_needed": "Give to Daddies as their project or develop in-house?"
  }'::jsonb,
  'Seed platform with Graha & Transmart opportunities, decide Daddies involvement',
  'high',
  ARRAY['venture', 'marketplace', 'sponsorship', 'mvp', 'digital'],
  '2025-11-03 08:31:00',
  '2025-11-03 08:33:00'
);

-- ============================================
-- SAMPLE UPDATE LOGS (to show activity)
-- ============================================

INSERT INTO updates_log (project_id, update_type, summary, author, created_at) VALUES
(
  (SELECT id FROM projects WHERE name = 'Manado (Grand Kawanua)' AND context_type = 'negotiation'),
  'status_update',
  'Payment terms discussion in progress with Pak Erwin Transmart',
  'Hendry',
  '2025-11-04 12:00:00'
),
(
  (SELECT id FROM projects WHERE name = 'Palembang (Transmart)' AND context_type = 'negotiation'),
  'negotiation_update',
  'Negotiating payment structure: quarterly vs yearly. Grace period options discussed.',
  'Hendry',
  '2025-10-31 11:39:00'
),
(
  (SELECT id FROM projects WHERE name = 'Manado (Grand Kawanua)' AND context_type = 'pre_opening'),
  'file_received',
  'Architect proposal received from Ilalang Design: Lingkup Kerja dan Fee (Padel Manado).pdf',
  'Win',
  '2025-11-02 12:09:00'
),
(
  (SELECT id FROM projects WHERE name = 'CariSponsorPadel.com' AND context_type = 'venture'),
  'milestone',
  'Website launched at www.carisponsorpadel.com',
  'Eka',
  '2025-11-03 08:31:00'
),
(
  (SELECT id FROM projects WHERE name = 'Daddies Management Partnership' AND context_type = 'partnership'),
  'discussion',
  'Team discussion on management alternatives: Daddies vs HTS vs Alma',
  'Eka',
  '2025-11-04 14:14:00'
);

-- ============================================
-- VERIFICATION: Show what was created
-- ============================================

SELECT
  context_type,
  COUNT(*) as project_count,
  array_agg(name) as projects
FROM projects
GROUP BY context_type
ORDER BY context_type;
