-- ============================================
-- NOVA MEMORY SEED DATA (CORRECTED SCHEMA)
-- Historical context from WhatsApp chats
-- Generated: 2024-11-05
-- ============================================

-- ============================================
-- PROJECT: Manado (Grand Kawanua)
-- ============================================

-- Insert project
INSERT INTO projects (id, name, context_type, location, status, pic, data, next_action, deadline, tags, created_at, last_message_at)
VALUES (
  '276a9b17-bbeb-4a70-aaec-693f0a3ef155',
  'Manado',
  'pre_opening',
  'Grand Kawanua Mall, Manado',
  'active',
  'Eka',
  '{
    "financials": {
      "architect_fee": 30000000,
      "architect_dp_paid": 21000000,
      "deposit_increase": 150000000,
      "original_deposit": 100000000
    },
    "contacts": {
      "architect": "Ilalang",
      "landlord": "Grand Kawanua Management",
      "owner_rep": "Pak Budi"
    },
    "timeline": {
      "floor_plans_due": "2024-11-15",
      "rental_signing_target": "2024-11-11"
    },
    "checklist": {
      "pt_cv": true,
      "rental_agreement": false,
      "bank_account": false,
      "architect_hired": true,
      "contractor_selected": false
    }
  }'::jsonb,
  'Sign rental agreement on Monday',
  '2024-11-11',
  ARRAY['padel', 'mall', 'manado', 'north_sulawesi'],
  '2024-10-15 10:00:00+07',
  '2024-11-05 14:06:00+07'
);

-- Insert facts for Manado
INSERT INTO project_facts (project_name, fact_type, fact_category, fact_text, confidence, fact_data, stated_at, active)
VALUES
(
  'Manado',
  'milestone',
  'checklist',
  'PT/CV formation completed',
  1.0,
  '{"date": "2024-11-05", "checklist_item": "pt_cv", "status": "done"}'::jsonb,
  '2024-11-05 14:00:00+07',
  true
),
(
  'Manado',
  'decision',
  'people',
  'Selected Ilalang as architect with 30jt fee',
  1.0,
  '{"date": "2024-11-05", "amount": 30000000, "person": "Ilalang", "role": "architect"}'::jsonb,
  '2024-11-05 14:00:00+07',
  true
),
(
  'Manado',
  'financial',
  'payment',
  'Paid architect down payment 21jt in cash',
  1.0,
  '{"date": "2024-11-05", "amount": 21000000, "payment_method": "cash", "purpose": "architect_dp"}'::jsonb,
  '2024-11-05 14:00:00+07',
  true
),
(
  'Manado',
  'timeline',
  'deadline',
  'Floor plans delivery deadline set for Nov 15',
  1.0,
  '{"date": "2024-11-05", "deadline": "2024-11-15", "deliverable": "floor_plans", "responsible": "Ilalang"}'::jsonb,
  '2024-11-05 14:00:00+07',
  true
),
(
  'Manado',
  'issue',
  'financial',
  'Landlord increased deposit requirement from 100jt to 150jt',
  1.0,
  '{"date": "2024-11-05", "old_amount": 100000000, "new_amount": 150000000, "type": "deposit_increase"}'::jsonb,
  '2024-11-05 14:00:00+07',
  true
),
(
  'Manado',
  'decision',
  'approval',
  'Pak Budi approved increased deposit of 150jt',
  1.0,
  '{"date": "2024-11-05", "amount": 150000000, "approved_by": "Pak Budi", "type": "deposit_approval"}'::jsonb,
  '2024-11-05 14:00:00+07',
  true
),
(
  'Manado',
  'timeline',
  'target',
  'Target rental agreement signing Monday Nov 11',
  0.9,
  '{"date": "2024-11-05", "target_date": "2024-11-11", "action": "sign_rental_agreement"}'::jsonb,
  '2024-11-05 14:00:00+07',
  true
);

-- ============================================
-- PROJECT: Bali Sanur
-- ============================================

INSERT INTO projects (id, name, context_type, location, status, pic, data, next_action, deadline, tags, created_at, last_message_at)
VALUES (
  '8a3f5d92-4c21-4b89-9e31-2b7f8a9c3d44',
  'Bali Sanur',
  'negotiation',
  'Sanur, Bali',
  'paused',
  'Eka',
  '{
    "financials": {
      "monthly_rental": 15000000,
      "deposit_required": 45000000
    },
    "contacts": {
      "owner": "Pak Made",
      "broker": "Bu Kadek"
    },
    "issues": {
      "location": "Too far from main road",
      "parking": "Limited parking space"
    }
  }'::jsonb,
  'Decide whether to proceed or drop',
  NULL,
  ARRAY['padel', 'bali', 'sanur', 'negotiation'],
  '2024-10-20 09:00:00+07',
  '2024-11-03 16:30:00+07'
);

INSERT INTO project_facts (project_name, fact_type, fact_category, fact_text, confidence, fact_data, stated_at, active)
VALUES
(
  'Bali Sanur',
  'financial',
  'terms',
  'Monthly rental 15jt with 3 months deposit',
  1.0,
  '{"date": "2024-11-03", "monthly_amount": 15000000, "deposit_months": 3, "total_deposit": 45000000}'::jsonb,
  '2024-11-03 10:00:00+07',
  true
),
(
  'Bali Sanur',
  'issue',
  'location',
  'Location too far from main road causing accessibility concerns',
  0.9,
  '{"date": "2024-11-03", "type": "location_issue", "impact": "accessibility"}'::jsonb,
  '2024-11-03 10:00:00+07',
  true
),
(
  'Bali Sanur',
  'relationship',
  'people',
  'Pak Made is the venue owner',
  1.0,
  '{"date": "2024-11-03", "person": "Pak Made", "role": "venue_owner"}'::jsonb,
  '2024-11-03 10:00:00+07',
  true
);

-- ============================================
-- PROJECT: BSD Serpong
-- ============================================

INSERT INTO projects (id, name, context_type, location, status, pic, data, next_action, deadline, tags, created_at, last_message_at)
VALUES (
  'c7e2a1b6-8f93-4d52-a831-5c9f7d3e2b11',
  'BSD Serpong',
  'negotiation',
  'BSD City, Serpong, Tangerang',
  'active',
  'Eka',
  '{
    "financials": {
      "investment_estimate": 500000000
    },
    "contacts": {
      "mall_management": "BSD City Management"
    },
    "status": {
      "stage": "Initial discussion",
      "interest_level": "high"
    }
  }'::jsonb,
  'Schedule site visit and feasibility study',
  '2024-11-20',
  ARRAY['padel', 'bsd', 'serpong', 'mall', 'negotiation'],
  '2024-10-25 14:00:00+07',
  '2024-11-04 11:00:00+07'
);

INSERT INTO project_facts (project_name, fact_type, fact_category, fact_text, confidence, fact_data, stated_at, active)
VALUES
(
  'BSD Serpong',
  'financial',
  'estimate',
  'Estimated investment 500jt for BSD location',
  0.8,
  '{"date": "2024-11-04", "amount": 500000000, "type": "investment_estimate"}'::jsonb,
  '2024-11-04 11:00:00+07',
  true
),
(
  'BSD Serpong',
  'timeline',
  'next_step',
  'Site visit and feasibility study needed',
  0.9,
  '{"date": "2024-11-04", "action": "site_visit", "purpose": "feasibility_study"}'::jsonb,
  '2024-11-04 11:00:00+07',
  true
);

-- ============================================
-- PROJECT: Jakarta Kuningan
-- ============================================

INSERT INTO projects (id, name, context_type, location, status, pic, data, next_action, deadline, tags, created_at, last_message_at)
VALUES (
  'd4f8b2c9-7a15-4e89-b623-8d7c5e9f1a33',
  'Jakarta Kuningan',
  'pre_opening',
  'Kuningan, South Jakarta',
  'active',
  'Eka',
  '{
    "financials": {
      "monthly_rental": 25000000,
      "renovation_budget": 350000000
    },
    "contacts": {
      "building_mgmt": "Kuningan Tower Management"
    },
    "checklist": {
      "pt_cv": false,
      "rental_agreement": true,
      "bank_account": false,
      "architect_hired": false,
      "contractor_selected": false
    }
  }'::jsonb,
  'Start PT/CV formation process',
  '2024-11-15',
  ARRAY['padel', 'jakarta', 'kuningan', 'prime_location'],
  '2024-09-15 10:00:00+07',
  '2024-11-05 09:30:00+07'
);

INSERT INTO project_facts (project_name, fact_type, fact_category, fact_text, confidence, fact_data, stated_at, active)
VALUES
(
  'Jakarta Kuningan',
  'milestone',
  'checklist',
  'Rental agreement signed for Kuningan location',
  1.0,
  '{"date": "2024-11-01", "checklist_item": "rental_agreement", "status": "done"}'::jsonb,
  '2024-11-01 10:00:00+07',
  true
),
(
  'Jakarta Kuningan',
  'financial',
  'terms',
  'Monthly rental 25jt for Kuningan location',
  1.0,
  '{"date": "2024-11-01", "amount": 25000000, "type": "monthly_rental"}'::jsonb,
  '2024-11-01 10:00:00+07',
  true
),
(
  'Jakarta Kuningan',
  'financial',
  'budget',
  'Renovation budget set at 350jt',
  0.9,
  '{"date": "2024-11-05", "amount": 350000000, "type": "renovation_budget"}'::jsonb,
  '2024-11-05 09:30:00+07',
  true
);

-- ============================================
-- PROJECT: Palembang
-- ============================================

INSERT INTO projects (id, name, context_type, location, status, pic, data, next_action, deadline, tags, created_at, last_message_at)
VALUES (
  'e5a9c3d7-2b84-4f91-a742-9e8d7c5b3a22',
  'Palembang',
  'partnership',
  'Palembang, South Sumatra',
  'paused',
  'Eka',
  '{
    "financials": {
      "partner_investment": 300000000,
      "apex_share": "40%",
      "partner_share": "60%"
    },
    "contacts": {
      "partner": "Pak Rahman",
      "local_contact": "Bu Siti"
    },
    "issues": {
      "reason_paused": "Partner financing not ready"
    }
  }'::jsonb,
  'Wait for partner financing confirmation',
  NULL,
  ARRAY['padel', 'palembang', 'partnership', 'paused'],
  '2024-10-01 12:00:00+07',
  '2024-11-02 15:45:00+07'
);

INSERT INTO project_facts (project_name, fact_type, fact_category, fact_text, confidence, fact_data, stated_at, active)
VALUES
(
  'Palembang',
  'decision',
  'structure',
  'Partnership structure 60-40 split (Partner-APEX)',
  1.0,
  '{"date": "2024-10-15", "apex_share": 40, "partner_share": 60, "type": "equity_split"}'::jsonb,
  '2024-10-15 14:00:00+07',
  true
),
(
  'Palembang',
  'issue',
  'blocker',
  'Project paused due to partner financing delays',
  1.0,
  '{"date": "2024-11-02", "reason": "partner_financing_delay", "status": "paused"}'::jsonb,
  '2024-11-02 15:45:00+07',
  true
),
(
  'Palembang',
  'relationship',
  'people',
  'Pak Rahman is the local partner for Palembang',
  1.0,
  '{"date": "2024-10-15", "person": "Pak Rahman", "role": "local_partner"}'::jsonb,
  '2024-10-15 14:00:00+07',
  true
);
