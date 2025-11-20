# COMPILATION PROMPT IMPROVEMENTS
## Based on Nov 6, 2025 Gap Analysis

---

## OVERVIEW

The current compilation prompt (/Users/stevenekahalim/apex-assistant/src/prompts/compilation.js) is missing **70% of critical business information** when processing document-heavy conversations. This document provides specific improvements to fix the gap.

---

## IMPROVEMENT 1: Document Content Extraction (CRITICAL)

### Current State
```javascript
## Must Include (if mentioned):
- **Numbers**: All amounts (500M not "substantial")
- **Dates**: Specific dates (Dec 15 not "next month")
- **Names**: People and companies (PT Wijaya not "the contractor")
- **Decisions**: What was decided and who decided
- **Next Steps**: Actions with deadlines
- **Documents**: PDF names, contract versions
```

### Problem
Instructs to include "PDF names" but doesn't emphasize extracting CONTENT from documents that are read/summarized in conversations by Nova/AI.

### Solution
Add new section after line 119 (after current "Must Include"):

```javascript
## Document Content Extraction

**CRITICAL: When PDF/document content appears in conversation (read by Nova or uploaded):**

Extract ALL substantive information, not just summaries. Treat documents as primary source material.

**For Financial/Legal Documents (contracts, agreements, invoices):**
✓ ALL payment amounts (deposits, fees, charges, penalties) with exact figures
✓ Payment schedules, milestones, and due dates
✓ Revenue sharing percentages or formulas
✓ Recurring costs (monthly/annual charges)
✓ Bank account details and payment instructions
✓ Financial obligations by each party
✓ Grace periods, payment terms, late fees
✓ Lease/contract duration and renewal options
✓ Signatories (names, titles, companies)
✓ Legal entity names and addresses

**For Vendor/Technical Documents (proposals, specifications):**
✓ ALL technical specifications (materials, dimensions, capacities)
✓ Warranty terms (duration, coverage, exclusions)
✓ Pricing breakdowns (base price, optional add-ons)
✓ Timeline/lead time commitments
✓ Service level agreements
✓ Installation/delivery scope and limitations
✓ After-sales support terms
✓ Customization options and pricing

**For Project Documents (scope of work, proposals):**
✓ Deliverables breakdown (what will be provided)
✓ Responsibilities by party
✓ Timeline and milestones
✓ Success criteria or KPIs
✓ Exclusions (what's NOT included)
✓ Assumptions or dependencies
✓ Change management process

**Example - WRONG (current behavior):**
Document: "Lease Confirmation - Grand Kawanua Mall"
Captured: "Terkait finalisasi pembayaran untuk Mall Grand Kawanua Manado"
❌ Missing: 250M down payment, 193M security, 15% rev share, 3+3 year term, etc.

**Example - RIGHT (desired behavior):**
Document: "Lease Confirmation - Grand Kawanua Mall"
Captured: "Lease confirmed: TF-02 West Wing 1,843m², 15% revenue share, 3+3 years. Payments: 250M down, 193.515M security (refundable), 15M fit-out (refundable), 35K/m² service charge monthly. Signed Oct 7 by Michael Widjaya (GKM) & Steven Eka Halim (Apex). Bank: PT Wenang Permai Sentosa A/C 02.075.00.11.121214 Bank Mega Manado."
✅ Complete, specific, actionable
```

---

## IMPROVEMENT 2: Context & Decision Reasoning (HIGH PRIORITY)

### Current State
```javascript
## Must Exclude:
- Greetings, acknowledgments, casual chat
- Off-topic personal discussions
- Repetitions of same information
- Uncertain info ("maybe", "possibly")
```

### Problem
Too broad - leads to excluding valuable context like frustrations, constraints, and decision reasoning.

### Solution
Modify existing "Must Exclude" (line 120) and add new "Context Preservation" section:

```javascript
## Must Exclude:
- Greetings, acknowledgments, casual chat
- Off-topic personal discussions (unrelated to business)
- Repetitions of same information
- Uncertain info ("maybe", "possibly") unless it represents a pending decision

## Context Preservation (NEW)

**Beyond capturing decisions, capture the WHY and context:**

✓ **Concerns & Blockers:** Team member frustrations, worries, or obstacles
   Example: "Win galau about court vendor" → Capture: "Win concerned about limited vendor options"

✓ **Decision Rationale:** Why a choice was made, not just the choice
   Example: "Layout pake sing kmrn drpd 2 minggu ga ono progres" → Capture: "Using existing layout to avoid 2-week delay"

✓ **Constraints:** Budget limits, time pressures, capability gaps
   Example: "Logistically very challenging soale" → Capture: "Vendor narrowed to 2 due to logistics constraints"

✓ **Urgency Indicators:** Words like "mesti" (must), "urgent", "ASAP", "need to decide"
   Example: "kt mesti finalize offer" → Capture: "URGENT: Must finalize offer for investor presentation"

✓ **Trade-offs:** When choosing between options A and B, note both options and selection criteria
   Example: "mau up RAB atau sing project fee" → Capture: "Decision pending: Increase RAB vs use project fee model for local investor"

**Why this matters:**
Nova needs context to answer "Why did we choose X?" not just "What did we choose?"
```

---

## IMPROVEMENT 3: Pending Items Tracking (HIGH PRIORITY)

### Current State
No guidance on tracking unanswered questions or pending items.

### Problem
Questions asked but not answered (like "Piro sue leadtime e lapangan?") are marked as "being confirmed" instead of "PENDING - need answer"

### Solution
Add new section after "Content Quality" (after line 132):

```javascript
## Pending Items & Open Loops

**When questions are ASKED but NOT ANSWERED:**

Mark with "PENDING:" prefix and note what's needed.

**Format:**
"[STATUS SUMMARY]. PENDING: [Specific question/action needed] (asked by [person] on [date])."

**Examples:**

Question asked, no answer in conversation:
- Wrong: "Lead time for court installation being confirmed"
- Right: "PENDING: Confirm court installation lead time (Steven asked Win on Nov 6, awaiting vendor response)"

Decision needed but not made:
- Wrong: "Deciding between RAB increase or project fee"
- Right: "DECISION PENDING: Choose between RAB increase vs project fee model for local investor presentation (must decide by [date if mentioned])"

Action assigned but not completed:
- Wrong: "Win to follow up with contractor"
- Right: "PENDING: Win to get contractor availability confirmation (assigned Nov 6)"

**Why this matters:**
Nova can proactively remind about open items and help track follow-ups.
```

---

## IMPROVEMENT 4: Deduplication Check (CRITICAL BUG FIX)

### Current State
```javascript
**History Preservation:**
MERGE appends to existing content. The database keeps everything. You NEVER delete or replace - you only add.
```

### Problem
Entry #152 has duplicate "UPDATE Nov 6" blocks appearing twice identically.

### Solution
Modify the MERGE section (around line 71) to include deduplication check:

```javascript
**History Preservation:**
MERGE appends to existing content. The database keeps everything. You NEVER delete or replace - you only add.

**IMPORTANT - Avoid Duplicates:**
Before adding additional_content via MERGE:
1. Check if the same information already exists in the entry
2. If updating the same topic on the same day, consolidate into ONE update block
3. Never append identical content twice

Example - WRONG:
Existing: "Budget 100M approved. UPDATE Nov 5: Budget increased to 500M."
Your MERGE: " UPDATE Nov 5: Budget increased to 500M."
Result: Duplicate content ❌

Example - RIGHT:
Existing: "Budget 100M approved. UPDATE Nov 5: Budget increased to 500M."
Your MERGE: " UPDATE Nov 5: Payment schedule confirmed: 50% upfront, 50% at completion."
Result: New information added ✅

**Deduplication Rules:**
- If new content is identical or 90% similar to existing → Skip MERGE
- If same topic, same day, different details → Consolidate into single UPDATE
- Each UPDATE block should add NEW information only
```

---

## IMPROVEMENT 5: Topic Coherence Validation (HIGH PRIORITY)

### Current State
```javascript
## When to use MERGE (Append to existing entry)
**This is your PRIMARY action. Use MERGE for:**
✓ Status changes (negotiation → contract signed)
✓ Budget/number changes (100M → 500M)
✓ Timeline shifts (Dec 10 → Dec 15)
...
```

### Problem
Entry #152 topic is "Coaches & Community" but content is about lease payments, construction, vendor selection. Complete mismatch.

### Solution
Add validation check to MERGE section (insert at line 52):

```javascript
## When to use MERGE (Append to existing entry)

**FIRST: Verify Topic Match**

Before MERGE, check if new content is RELATED to entry topic:

✓ **Compatible** - OK to MERGE:
  - Entry topic: "Manado Construction Timeline"
  - New content: "Contractor start date moved to Jan 15"
  → These are related, MERGE is appropriate

✓ **Compatible** - OK to MERGE:
  - Entry topic: "Manado Project Overview"
  - New content: "Interior design theme finalized"
  → Broad topic can accommodate specific updates

❌ **Incompatible** - DO NOT MERGE:
  - Entry topic: "Coaches & Community"
  - New content: "Lease payment 250M due, vendor quotes received"
  → These are UNRELATED, create NEW entry instead

❌ **Incompatible** - DO NOT MERGE:
  - Entry topic: "BSD Sponsorship Deal"
  - New content: "Manado construction update"
  → Different projects, create NEW or find correct Manado entry

**Topic Mismatch Resolution:**
If you want to MERGE but topic doesn't match:
1. Search KB again for more specific/correct entry
2. If no match found, create NEW entry (within 3/day limit)
3. In output, flag: "NOTE: Entry #X topic '[old topic]' may need update to '[suggested topic]'"

**This is your PRIMARY action AFTER verifying topic match. Use MERGE for:**
✓ Status changes (negotiation → contract signed)
✓ Budget/number changes (100M → 500M)
...
```

---

## IMPROVEMENT 6: Enhanced Financial Terms Template (MEDIUM PRIORITY)

### Current State
```javascript
## Must Include (if mentioned):
- **Numbers**: All amounts (500M not "substantial")
```

### Problem
Too vague for complex financial documents with multiple payment types.

### Solution
Expand the "Numbers" bullet point (line 113):

```javascript
## Must Include (if mentioned):
- **Numbers & Financial Terms**: All amounts with context
  - **Simple amounts**: 500M not "substantial", 250K not "a few hundred thousand"
  - **Multiple payment types**: Specify what each is (down payment vs security deposit vs fee)
  - **Payment schedules**: Link amounts to milestones ("120M at 50% construction")
  - **Recurring vs one-time**: Monthly charges, annual fees, lump sum payments
  - **Percentages**: Revenue share (15%), equity stake (30%), payment splits (40%/40%/20%)
  - **Per-unit costs**: Per m² (35K/m²), per court (750M/court), per hour rates
  - **Ranges**: "750-850M" not "around 800M", include both bounds
  - **Bank details**: Account number, bank name, account holder (for payments)

  Example - WRONG: "Lease payment finalized"
  Example - RIGHT: "Lease confirmed: 250M down payment, 193.515M security deposit (refundable), 15M fit-out deposit (refundable), 35K/m² service charge monthly, 15% revenue share"
```

---

## IMPROVEMENT 7: System Message Enhancement

### Current State (line 209)
```javascript
system: "You are a Knowledge Base Compilation Engine. Always respond with valid JSON only, no explanations."
```

### Problem
Generic system message doesn't emphasize document extraction importance.

### Solution
Enhance system message in knowledgeCompiler.js:

```javascript
system: "You are a Knowledge Base Compilation Engine for Apex Sports Lab. Your PRIMARY TASK is to extract ALL critical business information from conversations, especially from documents (PDFs, contracts, proposals). Capture complete financial terms, technical specs, and context - not just summaries. Always respond with valid JSON only, no explanations. Prioritize completeness over brevity."
```

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Critical Fixes (Do First)
- [ ] Add Document Content Extraction section (Improvement #1)
- [ ] Add Deduplication Check to MERGE logic (Improvement #4)
- [ ] Add Topic Coherence Validation (Improvement #5)
- [ ] Update system message (Improvement #7)

### Phase 2: Context Improvements (Do Second)
- [ ] Add Context Preservation section (Improvement #2)
- [ ] Add Pending Items Tracking section (Improvement #3)
- [ ] Enhance Financial Terms guidance (Improvement #6)

### Phase 3: Testing
- [ ] Re-run Nov 6, 2025 compilation with new prompt
- [ ] Compare new output to ideal recap (from GAP-ANALYSIS-NOV6.md)
- [ ] Measure improvement: Should go from 30% → 80%+ information capture
- [ ] Test on other document-heavy days (Oct 7-9, for example)

### Phase 4: Validation
- [ ] Check for duplicates in new compilations
- [ ] Verify topic coherence in merged entries
- [ ] Confirm PENDING items are properly flagged
- [ ] Test Nova's ability to answer detailed questions using new KB entries

---

## EXPECTED OUTCOMES

### Before (Current Prompt)
- Information capture: ~30%
- Duplicate content issues: Yes
- Wrong entry topic issues: Yes
- Missing financial details: 70%+ lost
- Missing technical specs: 70%+ lost
- Context capture: Minimal

### After (Improved Prompt)
- Information capture: 80%+
- Duplicate content issues: Fixed
- Wrong entry topic issues: Prevented
- Missing financial details: <10% lost
- Missing technical specs: <10% lost
- Context capture: Comprehensive

---

## TESTING COMMAND

After implementing improvements, test with:

```bash
# Re-run Nov 6 compilation
node scripts/test-compilation-nov6.js

# Compare output
# Should produce Entry similar to "IDEAL Entry #152" from GAP-ANALYSIS-NOV6.md
```

---

## MAINTENANCE NOTES

### Monitor These Metrics Post-Implementation:
1. **Completeness**: Can Nova answer detailed questions from KB entries?
2. **Duplicates**: Check weekly for duplicate UPDATE blocks
3. **Topic coherence**: Review merged entries monthly for topic mismatches
4. **Document extraction**: Spot-check PDFs - are details captured or just summaries?

### Iterate Based On:
- User questions Nova cannot answer (indicates missing info)
- Manual KB entry corrections (indicates systematic gaps)
- Compilation quality over time (does it degrade or improve?)

---

## END OF IMPROVEMENTS DOCUMENT
