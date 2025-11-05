-- ============================================
-- INITIAL PROJECT DATA FROM WHATSAPP HISTORY
-- Extracted from Apex Sports Lab chat (7,942 messages)
-- Created: November 4, 2025
-- ============================================

-- Clear existing test data (keep structure)
TRUNCATE TABLE updates_log CASCADE;
TRUNCATE TABLE files CASCADE;
TRUNCATE TABLE projects CASCADE;

-- ============================================
-- NEGOTIATION CONTEXT PROJECTS
-- ============================================

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

-- ============================================
-- PRE-OPENING CONTEXT PROJECTS
-- ============================================

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

-- ============================================
-- PARTNERSHIP CONTEXT PROJECTS
-- ============================================

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

-- ============================================
-- VENTURE CONTEXT PROJECTS
-- ============================================

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
-- SUMMARY STATS
-- ============================================
-- Total projects: 7
-- NEGOTIATION: 2 (Manado, Palembang)
-- PRE_OPENING: 2 (Manado, Palembang)
-- PARTNERSHIP: 2 (Graha Padel, Daddies)
-- VENTURE: 1 (CariSponsorPadel)
--
-- Note: Manado and Palembang appear in both NEGOTIATION and PRE_OPENING contexts
-- This is intentional - same physical project, different business phases
-- ============================================

SELECT
  context_type,
  COUNT(*) as project_count,
  array_agg(name) as projects
FROM projects
GROUP BY context_type
ORDER BY context_type;
