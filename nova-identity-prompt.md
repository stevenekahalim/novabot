# Nova Configuration - Identity, Context & SOP

I'm building **Nova**, an AI assistant that monitors WhatsApp messages for my padel court construction company (APEX). Nova will:
- Read messages from WhatsApp groups and private chats
- Classify messages (PROJECT_UPDATE, QUESTION, BLOCKER, DECISION, CASUAL)
- Extract project data (costs, dates, locations, people, status)
- Store data in Supabase database
- Sync to Notion dashboard
- Respond to users with confirmations and information

## Current Setup

**Technology Stack:**
- WhatsApp integration (whatsapp-web.js)
- OpenAI GPT-4 for classification and responses
- Supabase (PostgreSQL) as primary database
- Notion for visual dashboards
- Running 24/7 on DigitalOcean server

**Database Schema:**
- Projects table: id, name, location, status (Planning/Rental/Design/Construction/Complete), pic, monthly_cost, phase, notes, last_update
- Messages table: logs all WhatsApp messages with classification
- Updates table: tracks project updates timeline

## Help Me Define Nova's Configuration

Please help me define the following aspects of Nova in detail:

---

## 1. NOVA'S IDENTITY & PERSONALITY

**Questions to consider:**
- What is Nova's primary purpose/mission?
- How should Nova introduce itself when someone first messages it?
- Should Nova have a personality? (Professional? Friendly? Casual? Mix?)
- Tone: Formal Indonesian (Anda) or casual (kamu/lo)?
- Should Nova use emojis? If yes, which ones and when?
- How should Nova sign off messages?
- Should Nova acknowledge who it's talking to by name?

**Context about my company (APEX):**
- Industry: Padel court construction in Indonesia
- Business model: We rent locations, design, and build padel courts
- Scale: [Tell Claude: How many projects? How many team members? Growth plans?]
- Culture: [Tell Claude: Startup? Corporate? Fast-paced? Collaborative?]

---

## 2. TEAM CONTEXT & ROLES

**Current team members I mentioned:**
- Eka (that's me)
- Hendry
- Win

**Please help me define:**
- What is each person's role? (e.g., Project Manager, Construction Lead, Business Development)
- Reporting hierarchy: Who reports to whom?
- Decision-making authority: Who approves what?
- Escalation paths: For blockers/urgent issues, who should be tagged?
- Work style: Are people hands-on or strategic? Detail-oriented or big picture?

**For each team member, I need:**
- Full name and preferred name
- Role and responsibilities
- Types of projects they typically handle
- Their communication style (prefers details? quick updates?)
- When should Nova tag them? (e.g., "@Eka for all blockers")

---

## 3. STANDARD OPERATING PROCEDURES (SOPs)

### A. Message Processing Rules

**When should Nova respond vs silently log?**
- Option 1: Always respond with confirmation (even for casual messages?)
- Option 2: Only respond to PROJECT_UPDATE, QUESTION, BLOCKER, DECISION
- Option 3: Only respond to direct questions, silently log updates
- Custom rule: [Your preference]

**Response length:**
- Short confirmations? (e.g., "✅ Saved")
- Detailed summaries? (e.g., "✅ Updated Jakarta Selatan: Status=Construction, Cost=15M, PIC=Eka")
- Adaptive? (Short in groups, detailed in private)

### B. Project Lifecycle SOPs

**For each project status, what are the standard steps?**

1. **Planning Phase:**
   - What information is needed?
   - Who is typically involved?
   - What are the decision gates?
   - When does it move to next phase?

2. **Rental Phase:**
   - What needs to be confirmed?
   - Documentation required?
   - Typical duration?

3. **Design Phase:**
   - Who handles design?
   - Approval process?
   - Deliverables?

4. **Construction Phase:**
   - Milestones to track?
   - Quality checkpoints?
   - Typical timeline?

5. **Complete:**
   - Handover process?
   - Documentation?
   - Follow-up actions?

### C. Automated Workflows

**Should Nova proactively do any of these?**
- [ ] Send weekly project summaries
- [ ] Alert if project hasn't been updated in X days
- [ ] Remind about upcoming milestones/deadlines
- [ ] Flag cost overruns
- [ ] Notify when project moves to new phase
- [ ] Daily/weekly digest to specific people

**For each automation you want:**
- Trigger condition (e.g., "no update for 7 days")
- Action (e.g., "message group asking for update")
- Frequency/timing
- Who should receive notification

### D. Data Quality Rules

**How should Nova handle ambiguous/incomplete data?**
- Missing project name: Ask for clarification? Or try to infer from context?
- Unclear costs (e.g., "sekitar 15 juta"): Store as is? Ask for exact amount?
- Conflicting updates: Latest wins? Or ask for clarification?
- Multiple projects in one message: Process all? Ask to separate?

---

## 4. PRIVATE MESSAGE BEHAVIOR

**Use cases for private messaging Nova:**
- I want to add project updates privately (not clog up group chat)
- I want to ask Nova questions privately
- Quick data entry without team seeing

**Define:**
- Should private messages get MORE detailed responses than group messages?
  - Group: Short confirmation
  - Private: Detailed confirmation + current project status?

- Should Nova send confirmations for both private and group updates?
  - Always confirm?
  - Only confirm in private?

- Privacy: If I update a project privately, should Nova notify the group?
  - Option 1: Silent (only I know)
  - Option 2: Post summary to group
  - Option 3: Ask me each time

---

## 5. SPECIAL COMMANDS & FEATURES

**What commands should Nova understand?**

Suggested commands:
- `summary` - Overall project portfolio status
- `status [project name]` - Specific project details
- `list` - All active projects
- `help` - How to use Nova
- `costs` - Total monthly costs across all projects
- `timeline` - Upcoming milestones
- `blockers` - Current blockers across projects
- `update [project]` - Prompt guided data entry
- `new project` - Start new project entry

**For each command:**
- Exact trigger word(s)
- What Nova should respond with
- Who can use it (everyone? Just certain people?)
- Where it works (groups? private? both?)

---

## 6. RESPONSE TEMPLATES

**Help me design response templates for common scenarios:**

### Example 1: Project Update Confirmation
**Scenario:** Someone posts "Jakarta Selatan construction 60% selesai, cost 15jt this month"

**Current template:**
```
✅ Updated: *Jakarta Selatan*
💰 Cost: Rp 15,000,000
📊 Progress: 60%
📍 Status: Construction

_Last update: [timestamp]_
```

**Should it be:**
- Shorter? Longer?
- More emojis? Less emojis?
- Include next steps?
- Different format?

### Example 2: Question Response
**Scenario:** "Kapan mulai construction Palembang?"

**What should Nova say?**
- Just data? ("Construction starts Nov 15")
- Contextual? ("Based on rental completion on Nov 10, construction scheduled for Nov 15")
- With reasoning? ("Construction starts Nov 15 - timeline: Rental (done), Design (in progress, 80%), Construction (planned)")

### Example 3: Blocker Alert
**Scenario:** "BLOCKER - Permit Jakarta Selatan stuck, sudah 2 minggu"

**Nova should:**
- Alert specific person? ("⚠️ @Eka - Blocker on Jakarta Selatan")
- Just log it? (Silent logging)
- Ask follow-up? ("Apa sudah kontak dinas perizinan?")

### Example 4: Missing Information
**Scenario:** "Cost naik jadi 20 juta" (but which project?)

**Nova should:**
- Ask politely? ("Project mana ya? 😊")
- Stern? ("Tolong mention nama project")
- Suggest options? ("Maksudnya Jakarta Selatan, Palembang, atau project lain?")

---

## 7. ERROR HANDLING & EDGE CASES

**How should Nova handle:**
- **Can't understand message:** What to say?
- **Database error:** Notify me? Try again? Silent fail?
- **OpenAI API down:** Fallback behavior?
- **Conflicting data:** (Update says "Construction" but database shows "Design")
- **Unknown project name:** Create new? Ask first?
- **Spam/repeated messages:** Ignore duplicates?

---

## 8. MULTILINGUAL HANDLING

**Language mix common in my team:**
- Mostly Indonesian with English technical terms
- Sometimes full English
- Casual slang (gimana, nih, dong, gak)

**Should Nova:**
- Always respond in Indonesian?
- Match the language of the incoming message?
- Mix both (like how we actually talk)?

**Example casual Indonesian patterns Nova should understand:**
- "Palembang gimana nih?" = Status check
- "Jakarta udah sampe mana?" = Progress check
- "Biaya naik dong, sekarang 18jt" = Cost update
- "Kita ambil aja spot itu" = Decision

---

## 9. NOTION INTEGRATION

**What should the Notion dashboard show?**
- Just current data?
- Historical trends?
- Visual indicators (🔴 for delayed, 🟢 for on-track)?
- Automated reports?

**Should Nova:**
- Update Notion in real-time?
- Batch updates (every hour)?
- Only update on significant changes?

---

## 10. FUTURE FEATURES (Optional - Think Ahead)

**What else might I want Nova to do later?**
- Voice note transcription (already planned)
- Photo recognition (extract costs from receipts?)
- Integration with accounting software?
- Client-facing updates?
- Automated reporting to investors/stakeholders?
- Scheduling/calendar integration?
- Budget forecasting based on trends?
- Risk assessment (flag projects likely to delay)?

---

## OUTPUT NEEDED

Based on this discussion, please provide:

1. **Complete Identity Statement** for Nova (who it is, mission, personality)
2. **System Prompt** - detailed instructions for GPT-4 (personality, tone, knowledge)
3. **Team Context** - roles, escalation paths, communication preferences
4. **SOP Playbook** - rules for each message type and scenario
5. **Response Templates** - exact wording for common responses
6. **Command Definitions** - list of all commands with triggers and outputs
7. **Error Messages** - friendly messages for edge cases
8. **Configuration File Format** - so I can easily update this later

Please be as specific and detailed as possible. I'll use this output to configure Nova's AI prompts and behavior.
