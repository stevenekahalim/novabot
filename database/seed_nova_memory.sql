-- ============================================
-- NOVA MEMORY SEED DATA
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
INSERT INTO project_facts (project_id, fact_type, fact_text, context, confidence, metadata)
VALUES
(
  '276a9b17-bbeb-4a70-aaec-693f0a3ef155',
  'milestone',
  'PT/CV formation completed',
  'PT sudah selesai',
  1.0,
  '{"date": "2024-11-05", "checklist_item": "pt_cv", "status": "done"}'::jsonb
),
(
  '276a9b17-bbeb-4a70-aaec-693f0a3ef155',
  'decision',
  'Selected Ilalang as architect with 30jt fee',
  'Met with architect Ilalang today, he is good, agreed 30jt fee',
  1.0,
  '{"date": "2024-11-05", "amount": 30000000, "person": "Ilalang", "role": "architect"}'::jsonb
),
(
  '276a9b17-bbeb-4a70-aaec-693f0a3ef155',
  'financial',
  'Paid architect down payment 21jt in cash',
  'DP 21jt paid cash',
  1.0,
  '{"date": "2024-11-05", "amount": 21000000, "payment_method": "cash", "purpose": "architect_dp"}'::jsonb
),
(
  '276a9b17-bbeb-4a70-aaec-693f0a3ef155',
  'timeline',
  'Floor plans delivery deadline set for Nov 15',
  'He will deliver floor plans by Nov 15',
  1.0,
  '{"date": "2024-11-05", "deadline": "2024-11-15", "deliverable": "floor_plans", "responsible": "Ilalang"}'::jsonb
),
(
  '276a9b17-bbeb-4a70-aaec-693f0a3ef155',
  'issue',
  'Landlord increased deposit requirement from 100jt to 150jt',
  'Landlord wants to increase deposit from 100jt to 150jt',
  1.0,
  '{"date": "2024-11-05", "old_amount": 100000000, "new_amount": 150000000, "type": "deposit_increase"}'::jsonb
),
(
  '276a9b17-bbeb-4a70-aaec-693f0a3ef155',
  'decision',
  'Pak Budi approved increased deposit of 150jt',
  'Discussed with Pak Budi (owner) about the deposit increase, he is okay with it',
  1.0,
  '{"date": "2024-11-05", "amount": 150000000, "approved_by": "Pak Budi", "type": "deposit_approval"}'::jsonb
),
(
  '276a9b17-bbeb-4a70-aaec-693f0a3ef155',
  'timeline',
  'Target rental agreement signing Monday Nov 11',
  'We should aim to sign on Monday',
  0.9,
  '{"date": "2024-11-05", "target_date": "2024-11-11", "action": "sign_rental_agreement"}'::jsonb
);

-- ============================================
-- PROJECT: Bali Sanur
-- ============================================

-- Insert project
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

-- Insert facts for Bali Sanur
INSERT INTO project_facts (project_id, fact_type, fact_text, context, confidence, metadata)
VALUES
(
  '8a3f5d92-4c21-4b89-9e31-2b7f8a9c3d44',
  'financial',
  'Monthly rental 15jt with 3 months deposit',
  'Rental 15jt/month, deposit 3 months',
  1.0,
  '{"date": "2024-11-03", "monthly_amount": 15000000, "deposit_months": 3, "total_deposit": 45000000}'::jsonb
),
(
  '8a3f5d92-4c21-4b89-9e31-2b7f8a9c3d44',
  'issue',
  'Location too far from main road causing accessibility concerns',
  'The location is quite far from the main road',
  0.9,
  '{"date": "2024-11-03", "type": "location_issue", "impact": "accessibility"}'::jsonb
),
(
  '8a3f5d92-4c21-4b89-9e31-2b7f8a9c3d44',
  'relationship',
  'Pak Made is the venue owner',
  'Discussed with Pak Made (owner)',
  1.0,
  '{"date": "2024-11-03", "person": "Pak Made", "role": "venue_owner"}'::jsonb
);

-- ============================================
-- PROJECT: BSD Serpong
-- ============================================

-- Insert project
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

-- Insert facts for BSD Serpong
INSERT INTO project_facts (project_id, fact_type, fact_text, context, confidence, metadata)
VALUES
(
  'c7e2a1b6-8f93-4d52-a831-5c9f7d3e2b11',
  'financial',
  'Estimated investment 500jt for BSD location',
  'Investment around 500jt for BSD',
  0.8,
  '{"date": "2024-11-04", "amount": 500000000, "type": "investment_estimate"}'::jsonb
),
(
  'c7e2a1b6-8f93-4d52-a831-5c9f7d3e2b11',
  'timeline',
  'Site visit and feasibility study needed',
  'Need to do site visit first',
  0.9,
  '{"date": "2024-11-04", "action": "site_visit", "purpose": "feasibility_study"}'::jsonb
);

-- ============================================
-- PROJECT: Jakarta (Kuningan)
-- ============================================

-- Insert project
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

-- Insert facts for Jakarta Kuningan
INSERT INTO project_facts (project_id, fact_type, fact_text, context, confidence, metadata)
VALUES
(
  'd4f8b2c9-7a15-4e89-b623-8d7c5e9f1a33',
  'milestone',
  'Rental agreement signed for Kuningan location',
  'Kuningan rental signed',
  1.0,
  '{"date": "2024-11-01", "checklist_item": "rental_agreement", "status": "done"}'::jsonb
),
(
  'd4f8b2c9-7a15-4e89-b623-8d7c5e9f1a33',
  'financial',
  'Monthly rental 25jt for Kuningan location',
  'Rental 25jt/month for Kuningan',
  1.0,
  '{"date": "2024-11-01", "amount": 25000000, "type": "monthly_rental"}'::jsonb
),
(
  'd4f8b2c9-7a15-4e89-b623-8d7c5e9f1a33',
  'financial',
  'Renovation budget set at 350jt',
  'Renovation budget around 350jt',
  0.9,
  '{"date": "2024-11-05", "amount": 350000000, "type": "renovation_budget"}'::jsonb
);

-- ============================================
-- PROJECT: Palembang (Partnership Discussion)
-- ============================================

-- Insert project
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

-- Insert facts for Palembang
INSERT INTO project_facts (project_id, fact_type, fact_text, context, confidence, metadata)
VALUES
(
  'e5a9c3d7-2b84-4f91-a742-9e8d7c5b3a22',
  'decision',
  'Partnership structure 60-40 split (Partner-APEX)',
  'Agreed 60-40 split, partner gets 60%, we get 40%',
  1.0,
  '{"date": "2024-10-15", "apex_share": 40, "partner_share": 60, "type": "equity_split"}'::jsonb
),
(
  'e5a9c3d7-2b84-4f91-a742-9e8d7c5b3a22',
  'issue',
  'Project paused due to partner financing delays',
  'Partner not ready with financing yet',
  1.0,
  '{"date": "2024-11-02", "reason": "partner_financing_delay", "status": "paused"}'::jsonb
),
(
  'e5a9c3d7-2b84-4f91-a742-9e8d7c5b3a22',
  'relationship',
  'Pak Rahman is the local partner for Palembang',
  'Discussion with Pak Rahman about partnership',
  1.0,
  '{"date": "2024-10-15", "person": "Pak Rahman", "role": "local_partner"}'::jsonb
);
