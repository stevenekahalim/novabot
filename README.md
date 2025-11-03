# 🤖 APEX Assistant

WhatsApp AI Agent for automated project management.

## Overview

APEX Assistant automatically monitors your WhatsApp group chat and:
- Tracks all project updates in Supabase database
- Syncs data to Notion for visual dashboards
- Provides intelligent responses and confirmations
- Never forgets a project or deadline

**The team just uses WhatsApp normally. The agent does the rest.**

---

## Quick Start

### 1. Prerequisites

- DigitalOcean server (Ubuntu 24.04, 2GB RAM)
- Spare phone with WhatsApp (for initial setup)
- OpenAI API key
- Supabase account
- Notion account (optional)

### 2. Installation

SSH into your DigitalOcean server:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Clone repository (or upload code)
git clone <your-repo-url> apex-assistant
cd apex-assistant

# Install dependencies
npm install
```

### 3. Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit with your credentials
nano .env
```

Fill in your credentials:

```bash
# OpenAI
OPENAI_API_KEY=sk-your-key-here

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-key-here

# Notion (optional)
NOTION_TOKEN=secret_xxx
NOTION_PROJECTS_DB_ID=xxx

# WhatsApp Group
TARGET_GROUP_NAME=APEX
```

### 4. Set Up Supabase Database

Go to your Supabase project → SQL Editor → Run this:

```sql
-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  location TEXT,
  status TEXT CHECK (status IN ('planning', 'rental', 'design', 'construction', 'complete')),
  pic TEXT CHECK (pic IN ('Eka', 'Hendry', 'Win')),
  monthly_cost NUMERIC,
  phase TEXT,
  last_update TIMESTAMPTZ DEFAULT NOW(),
  next_action TEXT,
  target_launch DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Updates log
CREATE TABLE updates_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  date TIMESTAMPTZ DEFAULT NOW(),
  author TEXT,
  update_text TEXT NOT NULL,
  message_type TEXT CHECK (message_type IN ('progress', 'blocker', 'decision', 'meeting')),
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action items
CREATE TABLE action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assigned_to TEXT,
  due_date DATE,
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  created_from_update_id UUID REFERENCES updates_log(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_last_update ON projects(last_update);
CREATE INDEX idx_updates_project ON updates_log(project_id);
CREATE INDEX idx_updates_date ON updates_log(date DESC);
```

### 5. Start the Agent

```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 config (survive reboots)
pm2 save

# Enable PM2 startup on boot
pm2 startup
# Follow the command it gives you (copy-paste and run)
```

### 6. Connect WhatsApp

```bash
# View logs to see QR code
pm2 logs apex-assistant
```

You'll see a QR code in the terminal. Scan it with your **spare phone's** WhatsApp:

1. Open WhatsApp on spare phone
2. Go to Settings → Linked Devices → Link a Device
3. Scan the QR code shown in the terminal
4. Wait for "WhatsApp client is ready!" message

**Important:** Use a dedicated phone number, NOT your main number!

### 7. Add Agent to Group

1. Go to your APEX WhatsApp group
2. Add the spare phone number to the group
3. The agent will automatically start monitoring

---

## Usage

### Team Members - Just Use WhatsApp

Your team doesn't need to learn anything new. Just chat normally:

```
Hendry: "Palembang - rental confirmed 15jt/month"
Agent: ✅ Updated: Palembang
       💰 Cost: Rp 15,000,000
       📍 Status: rental

Win: "Manado design 80% done"
Agent: ✅ Updated: Manado
       📊 Progress: 80%

Eka: "What's the status of BSD?"
Agent: 📋 BSD
       📍 Status: construction
       👤 PIC: Hendry
       Last update: 2 days ago
```

### What the Agent Understands

**Project Updates:**
- "Palembang rental confirmed 20jt/month"
- "Manado design 70 persen selesai"
- "BSD construction started besok"

**Questions:**
- "What's the status of Palembang?"
- "Gimana progress Manado?"
- "BSD update dong"

**Blockers:**
- "Palembang stuck waiting for permits"
- "Manado ada masalah dengan contractor"
- "BSD blocked - need approval from owner"

**Decisions:**
- "Palembang confirmed - moving forward"
- "Manado design approved by client"

### Data Flow

```
WhatsApp Message
    ↓
Agent Classifies with AI
    ↓
Saves to Supabase (primary database)
    ↓
Syncs to Notion (visual dashboard)
    ↓
Sends Confirmation to WhatsApp
```

---

## Management Commands

### View Logs
```bash
# Real-time logs
pm2 logs apex-assistant

# Last 100 lines
pm2 logs apex-assistant --lines 100

# Error logs only
pm2 logs apex-assistant --err
```

### Restart Agent
```bash
pm2 restart apex-assistant
```

### Stop Agent
```bash
pm2 stop apex-assistant
```

### Check Status
```bash
pm2 status
```

### Health Check
```bash
# Via browser or curl
curl http://localhost:3000/health
```

### Monitor Resources
```bash
pm2 monit
```

---

## Troubleshooting

### Agent Not Responding

1. Check if running:
   ```bash
   pm2 status
   ```

2. Check logs for errors:
   ```bash
   pm2 logs apex-assistant --err
   ```

3. Restart:
   ```bash
   pm2 restart apex-assistant
   ```

### WhatsApp Disconnected

The agent auto-reconnects. If it doesn't:

1. Check logs:
   ```bash
   pm2 logs apex-assistant
   ```

2. If you see "Authentication failed", delete session and re-scan:
   ```bash
   pm2 stop apex-assistant
   rm -rf whatsapp-session/
   pm2 start apex-assistant
   pm2 logs apex-assistant  # Scan the new QR code
   ```

### OpenAI Rate Limit Hit

Agent automatically limits to 100 requests/hour. If hit:

```bash
# Check OpenAI stats
curl http://localhost:3000/health | jq '.openai_stats'
```

Wait an hour or increase limit in code.

### Supabase Connection Error

1. Check internet connection
2. Verify credentials in `.env`
3. Check Supabase service status

---

## Costs

### Monthly Estimate

| Service | Cost |
|---------|------|
| DigitalOcean | $12 |
| OpenAI API | $50-80 |
| Phone SIM | $3 |
| **Total** | **$65-95** |

### Cost Monitoring

Check OpenAI usage:
```bash
curl http://localhost:3000/health | jq '.openai_stats'
```

---

## Updating the Agent

### Deploy Code Updates

```bash
cd ~/apex-assistant
git pull
npm install
pm2 restart apex-assistant
```

### Update Dependencies

```bash
npm update
pm2 restart apex-assistant
```

---

## Backups

### Database (Supabase)

Automatic daily backups are included in Supabase (7-day retention).

Manual export:
1. Go to Supabase Dashboard
2. Database → Backups → Download

### WhatsApp Session

The `whatsapp-session` folder contains your QR login. Back it up:

```bash
# On server
tar -czf whatsapp-session-backup.tar.gz whatsapp-session/

# Download to local machine
scp user@server:~/apex-assistant/whatsapp-session-backup.tar.gz .
```

---

## Security

- ✅ All credentials in `.env` (never committed to git)
- ✅ WhatsApp session files protected (.gitignore)
- ✅ Supabase row-level security enabled
- ✅ OpenAI rate limiting (100/hour)
- ✅ Input sanitization on all messages
- ✅ Server firewall configured (UFW)

---

## Support

### Logs Location
- Application: `~/apex-assistant/logs/`
- PM2: `~/.pm2/logs/`

### Emergency Contact
- **CTO:** [Your contact]
- **Logs:** Always check `pm2 logs apex-assistant` first

---

## Architecture

```
├── src/
│   ├── index.js              # Main entry point
│   ├── whatsapp/
│   │   ├── client.js         # WhatsApp connection
│   │   └── messageHandler.js # Process messages
│   ├── ai/
│   │   ├── openai.js         # OpenAI client
│   │   └── classifier.js     # Message classification
│   ├── database/
│   │   └── supabase.js       # Database operations
│   ├── notion/
│   │   └── sync.js           # Notion integration
│   └── utils/
│       └── logger.js         # Logging
├── .env                      # Credentials (DO NOT COMMIT)
├── ecosystem.config.js       # PM2 configuration
└── package.json
```

---

## Week 2 Features (Coming Soon)

- [ ] Voice note transcription
- [ ] Daily digest (9 AM)
- [ ] Follow-up reminders (3-day rule)
- [ ] Deadline tracking
- [ ] Advanced context awareness

---

**Version:** 1.0.0 (Week 1 MVP)
**Last Updated:** November 2025
**Team:** APEX

🚀 **Your assistant is running. Team just chats. Projects get tracked. Simple.**
