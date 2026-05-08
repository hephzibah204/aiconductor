# 🚌 Conductor AI — Naija Transport Oracle

> Real-time transport intelligence for Nigerian commuters. AI-powered fare data, traffic alerts, and community reports for Lagos, Abuja, Port Harcourt, and Kano.

[![Status](https://img.shields.io/badge/status-active-00FF88?style=flat-square)](https://conductor-ai.ng)
[![Stack](https://img.shields.io/badge/stack-HTML%20%2B%20Supabase%20%2B%20OpenRouter-FFB800?style=flat-square)]()
[![License](https://img.shields.io/badge/license-MIT-00D4FF?style=flat-square)]()
[![Nigeria](https://img.shields.io/badge/made%20for-🇳🇬%20Nigeria-green?style=flat-square)]()

---

## What Is This?

Conductor AI is a Nigerian transport intelligence platform that helps commuters make smarter travel decisions. It combines crowdsourced fare data, AI-generated traffic analysis, and a community reporting system — all in a lightweight, mobile-first web app.

No app store needed. No backend server to manage. Works on any phone with a browser.

---

## Key Features

| Feature | Description |
|---|---|
| 🔮 AI Oracle | Chat-style AI assistant for transport questions in Nigerian context |
| 💰 Fare Calculator | Real-time fare estimates for Danfo, Keke, Okada, BRT, and Uber |
| 🚦 Traffic Reports | AI-generated congestion reports for major Nigerian cities |
| 📢 City Alerts | Weather, fuel scarcity, accidents, and road closure alerts |
| 👥 Community Feed | Crowdsourced fare and traffic reports with upvoting |
| 🏆 Gamification | Points, levels, badges, streaks for active contributors |
| 🤖 Admin Manager | 5-agent AI pipeline for content, moderation, and data updates |
| 📡 Real-time Sync | Supabase Realtime — updates push instantly to all users |

---

## App Pages

The project ships as four connected HTML files:

```
index.html                    ← Main user app (offline/demo)
app-live.html                 ← Supabase-powered live version with auth + realtime
admin.html                    ← Admin dashboard
setup-guide.html              ← Developer setup documentation
```

---

## Tech Stack

```
Frontend      HTML5 · CSS3 · Vanilla JavaScript (no framework needed)
Database      Supabase (PostgreSQL + Realtime + Auth + Storage)
AI Agents     OpenRouter API (Llama 3.1, Gemma 2, Mistral — all FREE tier)
Edge Compute  Supabase Edge Functions (Deno runtime)
Scheduler     pg_cron (built into Supabase — no cron server needed)
Hosting       Netlify / Vercel / GitHub Pages (all FREE)
Fonts         Unbounded · Instrument Sans · JetBrains Mono (Google Fonts)
```

**Why no backend server?** Supabase Edge Functions handle all server-side logic — API key management, AI calls, scheduled tasks. pg_cron replaces traditional cron jobs. The entire stack costs ₦0 to run.

---

## Cities Covered

| City | Transport Types |
|---|---|
| 🌊 Lagos | Danfo, BRT, Keke, Okada, Uber, Ferry |
| 🏛️ Abuja | Keke, Uber, Mini-bus |
| ⛽ Port Harcourt | Keke, Okada, Taxi |
| 🌍 Kano | Keke, Mini-bus, Okada |

**Phase 2 target cities:** Ibadan, Kaduna, Benin City, Enugu, Owerri

---

## Quick Start

### Option 1 — Run Locally (No setup needed)

```bash
# Clone the repo
git clone https://github.com/your-org/conductor-ai.git
cd conductor-ai

# Open in browser — no build step needed
open index.html
```

The main app works immediately with static demo data. No API keys required.

### Option 2 — Full Live Stack

You need: a free [Supabase](https://supabase.com) account and a free [OpenRouter](https://openrouter.ai) account.

```bash
# 1. Clone
git clone https://github.com/your-org/conductor-ai.git
cd conductor-ai

# 2. Install Supabase CLI
npm install -g supabase

# 3. Login and link project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# 3b. Deploy Edge Functions
# (See setup-guide.html for the full deploy list)
supabase functions deploy traffic-agent
supabase functions deploy fare-agent
supabase functions deploy alerts-agent
supabase functions deploy moderator-agent
supabase functions deploy content-agent
supabase functions deploy chat
supabase functions deploy admin-stats
supabase functions deploy admin-users
supabase functions deploy admin-fares
supabase functions deploy admin-content
supabase functions deploy admin-alerts
supabase functions deploy admin-feed

# 4. Run the database schema (from setup guide)
# Copy SQL from setup-guide.html → Schema section
# Paste into Supabase Dashboard → SQL Editor → Run

# 5. Open app-live.html
# Enter your Supabase URL + anon key in the connection panel
# Use admin.html to run agents after setting Supabase function secrets

# 6. Deploy to Netlify
netlify deploy --prod
```

Full step-by-step: open `setup-guide.html` in your browser.

---

## Admin

The admin dashboard (`admin.html`) is the control plane for the platform.

### AI Agents

| Agent | Model | Purpose |
|---|---|---|
| 🚦 Traffic | Llama 3.1 8B | Road condition reports for all cities |
| 💰 Fare | Gemma 2 9B | Fare index updates across all transport types |
| ⚠️ Alerts | Mistral 7B | Weather, fuel, accident, closure alerts |
| 🛡️ Moderator | Llama 3.1 8B | Community post moderation and spam removal |
| ✍️ Content | Gemma 2 9B | Transport tips and platform announcements |

**To run without Supabase:** double-click the **DEMO** button to simulate agent output.

**To go live:** set `OPENROUTER_KEY`, `CRON_SECRET`, `ADMIN_EMAILS`, and `ALLOWED_ORIGINS` as Supabase function secrets, then sign in on `admin.html`.

---

## Database Schema (Overview)

```sql
fare_reports       -- User-submitted fare data
traffic_updates    -- AI-generated traffic conditions
city_alerts        -- Emergency city-wide alerts
feed_posts         -- Community feed submissions
post_likes         -- User engagement tracking
fare_index         -- Canonical fare reference table
user_profiles      -- Gamification data (points, badges, streaks)
chat_logs          -- AI oracle conversation history
```

Full schema SQL is in `setup-guide.html` → Section 4.

---

## Environment Variables

Runtime config can be provided via `config.js` (see `config.example.js`) or entered in the connection modal.

| Variable | Where to Get It | Used In |
|---|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API | Live app, Admin |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API | Live app, Admin |
| `OPENROUTER_KEY` | openrouter.ai → Keys | Supabase Edge Functions |
| `CRON_SECRET` | Generate a long random secret | Supabase Edge Functions + pg_cron |
| `ADMIN_EMAILS` | Comma-separated allowlist | Supabase Edge Functions (admin runs) |
| `ALLOWED_ORIGINS` | Comma-separated origins | Supabase Edge Functions (CORS) |
| `CHAT_MODEL` | Optional OpenRouter model | Supabase Edge Functions (chat) |

For Edge Functions, set these as Supabase secrets:

```bash
supabase secrets set OPENROUTER_KEY=sk-or-...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set CRON_SECRET=your-long-random-secret
supabase secrets set ADMIN_EMAILS=you@company.com
supabase secrets set ALLOWED_ORIGINS=https://your-domain.com,http://localhost:3000
```

---

## Project Roadmap

### Phase 1 — MVP (Current)
- [x] Fare calculator (4 cities, all transport types)
- [x] AI Oracle chat interface
- [x] Community feed with upvoting
- [x] User profiles and gamification
- [x] Admin Manager with 5 AI agents
- [x] Supabase auth (magic link)
- [x] Real-time updates via WebSocket
- [x] Setup documentation

### Phase 2 — Growth
- [ ] WhatsApp Bot integration
- [ ] USSD interface for feature phones (`*347*FARE#`)
- [ ] 4 additional cities (Ibadan, Kaduna, Benin, Enugu)
- [ ] Verified reporter badges (community trust system)
- [ ] Supabase Edge Function agents (auto-running, no manual trigger)
- [ ] Push notifications (service worker)
- [ ] Offline mode (PWA + service worker cache)

### Phase 3 — Scale
- [ ] Native Android app (PWA installable)
- [ ] Driver/operator dashboard (fare setting, route management)
- [ ] Government data API integrations
- [ ] Multi-language support (Yoruba, Igbo, Hausa, Pidgin)
- [ ] Revenue model: featured routes, operator subscriptions

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

**Quick version:**

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test locally: open the HTML file in a browser
5. Submit a pull request with a clear description

No build pipeline. No `npm install`. Open the file and hack.

---

## File Structure

```
conductor-ai/
├── index.html                     # Main user-facing app (offline/demo)
├── app-live.html                  # Supabase live version
├── admin.html                     # Admin dashboard
├── setup-guide.html               # Setup documentation
├── config.example.js              # Example runtime config
├── README.md                      # This file
├── CONTRIBUTING.md                # Contributor guide
└── supabase/
    └── functions/
        ├── traffic-agent/         # Edge Function: traffic reports
        ├── fare-agent/            # Edge Function: fare updates
        ├── alerts-agent/          # Edge Function: city alerts
        ├── moderator-agent/       # Edge Function: post moderation
        ├── content-agent/         # Edge Function: content generation
        └── chat/                  # Edge Function: Conductor AI chat
```

---

## License

MIT License. Build on it, remix it, deploy it. Just give credit to the project.

---

## Contact

- **Project:** conductor-ai.ng
- **Issues:** GitHub Issues tab
- **Community:** See the feed inside the app

Built with ❤️ for Nigerian commuters. 🇳🇬
