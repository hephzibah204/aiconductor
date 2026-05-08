# Contributing to Conductor AI

Welcome. This guide is written for developers who want to contribute to Conductor AI — whether that's fixing a bug, adding a new city, building a new agent, or shipping a Phase 2 feature.

Read this fully before opening a pull request. It will save you time.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Understanding the Codebase](#2-understanding-the-codebase)
3. [Setting Up Your Dev Environment](#3-setting-up-your-dev-environment)
4. [How to Add a New City](#4-how-to-add-a-new-city)
5. [How to Add a New AI Agent](#5-how-to-add-a-new-ai-agent)
6. [How to Add a New Feature to the User App](#6-how-to-add-a-new-feature-to-the-user-app)
7. [Database Migrations](#7-database-migrations)
8. [Working with Supabase Edge Functions](#8-working-with-supabase-edge-functions)
9. [Admin Manager Extensions](#9-admin-manager-extensions)
10. [Code Style and Conventions](#10-code-style-and-conventions)
11. [Testing Your Changes](#11-testing-your-changes)
12. [Pull Request Process](#12-pull-request-process)
13. [Phase 2 Feature Specs](#13-phase-2-feature-specs)
14. [Good First Issues](#14-good-first-issues)

---

## 1. Architecture Overview

Conductor AI has **no dedicated backend server**. Everything runs through:

```
┌─────────────────────────────────────────────────────────┐
│                     USER'S BROWSER                       │
│  conductor-ai.html / conductor-ai-live.html              │
│  ↕ Supabase JS SDK (auth, db reads, realtime)           │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    SUPABASE                              │
│  PostgreSQL ── fare_reports, feed_posts, traffic_updates │
│  Realtime ──── WebSocket broadcast on INSERT/UPDATE      │
│  Auth ───────── Magic link email (no passwords)          │
│  Edge Functions ─ AI agent logic (Deno runtime)          │
│  pg_cron ────── Triggers Edge Functions on a schedule    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  OPENROUTER API                          │
│  Routes prompts to: Llama 3.1, Gemma 2, Mistral         │
│  All models available on FREE tier                       │
└─────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────┐
│              ADMIN MANAGER (separate page)               │
│  conductor-ai-manager.html                               │
│  Runs agents manually OR via auto-schedule               │
│  Approves/rejects AI-generated updates                   │
│  Manages users, fares, alerts, content                   │
└─────────────────────────────────────────────────────────┘
```

**Key insight:** The Admin Manager talks to OpenRouter directly from the browser using the operator's API key. Edge Functions are the production equivalent — they run the same logic server-side on a schedule.

---

## 2. Understanding the Codebase

### conductor-ai.html — Main User App

This is the primary user-facing file. It is a single-page application (SPA) with tab-based navigation. No framework — plain HTML, CSS, and JavaScript.

**Structure inside the file:**

```
<head>          Google Fonts imports, CSS variables, all styles
<body>
  <nav>         Tab navigation (Home, Fares, Traffic, Feed, Profile)
  .page#home    Hero, live strip, city stats, feature grid
  .page#fares   Fare calculator with autocomplete route search
  .page#traffic Traffic oracle with AI chat interface
  .page#feed    Community feed — post, like, share, filter
  .page#profile User profile, points, badges, leaderboard
<script>        All JS: data, functions, event handlers
```

**Key data structures:**

```javascript
// City fare data — edit this to update fares
const CITIES = {
  Lagos: {
    emoji: '🌊',
    area: 'Southwest Nigeria',
    population: '15M+',
    transports: {
      danfo:  { name:'Danfo', icon:'🚐', base:150, perKm:50 },
      keke:   { name:'Keke',  icon:'🛺', base:100, perKm:40 },
      // ...
    },
    routes: [
      { from:'Lekki', to:'Victoria Island', km:8 },
      // ...
    ]
  }
}

// Leaderboard data (replace with Supabase query in live version)
const LEADERBOARD = [ ... ]

// Community feed posts (replace with Supabase query in live version)
let feedPosts = [ ... ]
```

### conductor-ai-live.html — Supabase Live Version

This is `conductor-ai.html` with Supabase integration added. Key differences:

- Supabase JS SDK loaded from CDN
- Auth via magic link (email)
- Feed posts read from and written to `feed_posts` table
- Fare reports saved to `fare_reports` table
- Realtime subscription on `feed_posts` — new posts appear instantly
- `localStorage` used as fallback when not connected

**The Supabase connection setup (look for this in the script):**

```javascript
let sb = null;
let user = null;

async function connectSupabase() {
  const url = document.getElementById('sbUrl').value.trim();
  const key = document.getElementById('sbKey').value.trim();
  sb = supabase.createClient(url, key);
  // auth listener, realtime subscription, etc.
}
```

### conductor-ai-manager.html — Admin Manager

The admin panel. Five AI agents, each with:

- A config object in `AGENT_CONFIGS`
- A `runAgent(agentName)` call that hits OpenRouter
- A result parsed into the update queue
- Manual approve/reject/edit actions

**Agent config shape:**

```javascript
const AGENT_CONFIGS = {
  traffic: {
    icon: '🚦',
    name: 'TRAFFIC AGENT',
    color: 'cyan',
    desc: 'Description shown in agent detail panel',
    prompt: `System prompt sent to the LLM. Defines output JSON format.`
  },
  // fare, alerts, moderator, content follow same shape
}
```

### conductor-ai-setup-guide.html — Setup Docs

A standalone HTML documentation page. No JavaScript logic — just styled content. Update this whenever you change the schema, setup steps, or deployment process.

---

## 3. Setting Up Your Dev Environment

You need almost nothing.

**Minimum (static mode):**

```bash
git clone https://github.com/your-org/conductor-ai.git
cd conductor-ai
# Open conductor-ai.html in any browser
# Everything works with demo data
```

**Full live stack:**

```bash
# 1. Supabase account at supabase.com (free)
# 2. OpenRouter account at openrouter.ai (free)
# 3. Supabase CLI

npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# 4. Run schema migrations
# Copy SQL from setup guide Section 4 (Schema)
# Paste into Supabase Dashboard → SQL Editor → Run

# 5. Open conductor-ai-live.html
# Enter Supabase URL + anon key in the connection UI
```

**Hot reloading tip:** Use VS Code Live Server extension or:

```bash
npx serve .
# App runs at localhost:3000 with auto-reload
```

There is no build step, no `npm install`, no webpack, no TypeScript compilation. Open the file and edit.

---

## 4. How to Add a New City

Cities live in the `CITIES` object inside `conductor-ai.html`. Adding a city requires changes in two files.

### Step 1 — Add to conductor-ai.html

Find the `CITIES` constant and add your city following this exact shape:

```javascript
const CITIES = {
  // ... existing cities ...

  Ibadan: {
    emoji: '🌿',
    area: 'Southwest Nigeria',
    population: '3.5M+',
    transports: {
      danfo: {
        name: 'Danfo',
        icon: '🚐',
        base: 120,       // base fare in Naira
        perKm: 40,       // fare per kilometer
        minFare: 100,
        maxFare: 800,
        notes: 'Agodi Gate and Ring Road are main hubs'
      },
      keke: {
        name: 'Keke',
        icon: '🛺',
        base: 100,
        perKm: 35,
        minFare: 100,
        maxFare: 500,
        notes: 'Common in Bodija, Dugbe, and Challenge areas'
      },
      okada: {
        name: 'Okada',
        icon: '🏍️',
        base: 150,
        perKm: 50,
        minFare: 150,
        maxFare: 700,
        notes: 'Fastest for short hops in traffic'
      },
      uber: {
        name: 'Uber/Bolt',
        icon: '🚗',
        base: 600,
        perKm: 110,
        minFare: 600,
        maxFare: 3500,
        notes: 'Available but limited drivers compared to Lagos'
      }
    },
    routes: [
      { from: 'Bodija', to: 'Dugbe', km: 4 },
      { from: 'Challenge', to: 'Ring Road', km: 3 },
      { from: 'Agodi Gate', to: 'Iwo Road', km: 6 },
      { from: 'UI', to: 'Sango', km: 8 },
      { from: 'Ojoo', to: 'Dugbe', km: 7 },
    ],
    landmarks: ['Dugbe Market', 'Bodija Market', 'UI Campus', 'Agodi Gardens', 'Mapo Hall'],
    trafficPeak: '7:30–9:30am, 4:30–7pm',
    currency: '₦'
  }
}
```

Then add the city to the **city selector pills** in the HTML:

```html
<!-- Find the city-row div in the fares page and add: -->
<button class="cpill" onclick="selectCity('Ibadan',this)">🌿 Ibadan</button>
```

Add to the **home page stat strip** as well (the live strip section).

### Step 2 — Add to conductor-ai-manager.html

Find `FARE_DATA` and add the city:

```javascript
const FARE_DATA = {
  // ... existing cities ...
  Ibadan: {
    emoji: '🌿',
    routes: [
      { name: 'Bodija → Dugbe', min: 120, max: 350 },
      { name: 'Challenge → Ring Road', min: 100, max: 280 },
      { name: 'UI → Sango', min: 300, max: 600 },
      { name: 'Ojoo → Dugbe', min: 250, max: 500 },
    ]
  }
}
```

### Step 3 — Update the database (if using Supabase)

```sql
-- No schema change needed — city is stored as a string
-- But add seed data for the new city:
INSERT INTO fare_index (city, transport_type, route_from, route_to, min_fare, max_fare)
VALUES
  ('Ibadan', 'danfo', 'Bodija', 'Dugbe', 120, 350),
  ('Ibadan', 'keke',  'Challenge', 'Ring Road', 100, 280);
```

### Step 4 — Update the setup guide

Add the city to the cities table in `conductor-ai-setup-guide.html`.

### Step 5 — Update CONTRIBUTING.md and README.md

Add the city to the Cities Covered table.

---

## 5. How to Add a New AI Agent

Agents live in `AGENT_CONFIGS` in `conductor-ai-manager.html`.

### Step 1 — Define the agent config

```javascript
const AGENT_CONFIGS = {
  // ... existing agents ...

  safety: {
    icon: '🛡️',
    name: 'SAFETY AGENT',
    color: 'red',           // cyan | green | amber | red | purple
    desc: 'Monitors Nigerian transport safety incidents and generates commuter safety advisories.',
    prompt: `You are the Conductor AI Safety Agent monitoring Nigerian transport safety. 
Analyze recent incidents and generate safety advisories for commuters.
Output ONLY valid JSON in this exact format:
{
  "updates": [
    {
      "title": "Short advisory title",
      "body": "Safety advice in plain language, max 60 words, Nigerian context",
      "type": "safety",
      "city": "Lagos|Abuja|Port Harcourt|Kano",
      "severity": "info|warning|critical"
    }
  ]
}`
  }
}
```

**Prompt design rules:**
- Always tell the model to output ONLY valid JSON — no preamble, no markdown fences
- Define the exact JSON shape in the prompt — don't leave it ambiguous
- Include "Nigerian context" in the instruction — models default to US/UK context
- Keep `max_tokens` to 800 or less — agents should be focused, not verbose
- Test your prompt at openrouter.ai/playground before shipping

### Step 2 — Add the sidebar agent card

In the sidebar HTML, copy an existing agent card and update the IDs and labels:

```html
<div class="agent-card c-red" id="ac-safety" onclick="selectAgent('safety',this)">
  <div class="a-hdr">
    <span class="a-icon">🛡️</span>
    <span class="a-name">SAFETY</span>
    <button class="a-run" onclick="event.stopPropagation();runAgent('safety')">RUN</button>
  </div>
  <div class="a-model">llama-3.1-8b</div>
  <div class="a-row">
    <span class="a-status">
      <span class="sdot idle" id="sd-safety"></span>
      <span id="st-safety">IDLE</span>
    </span>
    <span id="tc-safety" style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink3)">0 runs</span>
  </div>
</div>
```

### Step 3 — Add to the pipeline visualization

```html
<!-- In the pipeline div, add a new node + arrow -->
<div class="pipe-arrow" id="pa-5"></div>
<div class="pipe-node">
  <div class="pipe-circle" id="pc-safety">🛡️</div>
  <div class="pipe-lbl">SAFETY</div>
</div>
```

### Step 4 — Add agent to state tracking

```javascript
// In the STATE section at top of script:
let agentRuns = { traffic:0, fare:0, alerts:0, moderator:0, content:0, safety:0 };
let agentUpdates = { traffic:0, fare:0, alerts:0, moderator:0, content:0, safety:0 };
```

### Step 5 — Add to runAllAgents() and runDemoMode()

```javascript
async function runAllAgents() {
  // Add 'safety' to the agents array:
  for(const agent of ['traffic','fare','alerts','moderator','content','safety']){
    await runAgent(agent);
    await sleep(300);
  }
}
```

Add demo data for the agent in `runDemoMode()`:

```javascript
const demoData = {
  // ... existing agents ...
  safety: {
    updates: [
      { title: 'Okada Safety Advisory', body: 'Wet road conditions in Lagos. Okada riders and passengers should ensure helmets are worn. Avoid shortcuts through flooded streets.' }
    ]
  }
}
```

### Step 6 — Add to the schedule panel

```html
<!-- In the schedule panel, add a new toggle row: -->
<div class="sched-row">
  <div class="sched-info">
    <span style="font-size:16px">🛡️</span>
    <div>
      <div style="font-size:13px;font-weight:600">Safety Agent</div>
      <div style="font-size:11px;color:var(--ink3)">Transport safety advisories</div>
    </div>
  </div>
  <label class="toggle">
    <input type="checkbox" id="sched-safety" onchange="toggleSched('safety',this)"/>
    <span class="toggle-slider"></span>
  </label>
</div>
```

### Step 7 — Create the Supabase Edge Function (production)

```typescript
// supabase/functions/safety-agent/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENROUTER_KEY = Deno.env.get('OPENROUTER_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Call OpenRouter
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      max_tokens: 800,
      messages: [
        { role: 'system', content: AGENT_CONFIGS.safety.prompt },
        { role: 'user', content: 'Generate safety advisories for Nigerian commuters today.' }
      ]
    })
  })

  const data = await response.json()
  const content = data.choices[0].message.content
  const parsed = JSON.parse(content)

  // Save to Supabase
  for (const update of parsed.updates) {
    await supabase.from('city_alerts').insert({
      city: update.city,
      type: 'safety',
      severity: update.severity,
      title: update.title,
      body: update.body,
      active: true,
    })
  }

  return new Response(JSON.stringify({ success: true, count: parsed.updates.length }))
})
```

Deploy it:

```bash
supabase functions deploy safety-agent
```

Schedule it with pg_cron:

```sql
SELECT cron.schedule('safety-check', '0 * * * *', -- every hour
  $$SELECT net.http_post(url:='https://YOUR_PROJECT.supabase.co/functions/v1/safety-agent',
    headers:='{"Authorization":"Bearer YOUR_ANON_KEY"}'::jsonb)$$
);
```

---

## 6. How to Add a New Feature to the User App

### Adding a New Tab/Page

1. Add a tab button to the `<nav>` section:

```html
<button class="nav-tab" onclick="showPage('routes',this)">🗺 Routes</button>
```

2. Add the page div:

```html
<div class="page" id="page-routes">
  <div class="page-wrap">
    <!-- your page content -->
  </div>
</div>
```

3. The `showPage()` function handles showing/hiding — no changes needed there.

4. Add mobile bottom nav entry if it's a primary feature:

```html
<!-- Find the bottom nav and add: -->
<div class="bnav-item" onclick="showPage('routes',null)">
  <div class="bnav-icon">🗺</div>
  <div class="bnav-label">Routes</div>
</div>
```

### Adding a New Transport Type

Find the `transports` object inside the relevant city in `CITIES` and add:

```javascript
ferry: {
  name: 'Ferry',
  icon: '⛴️',
  base: 500,
  perKm: 100,
  minFare: 500,
  maxFare: 2000,
  notes: 'Lagos Water Bus — Badagry, Ikorodu, Marina routes'
}
```

The fare calculator and result display will pick it up automatically because they iterate over `CITIES[city].transports`.

### Adding Autocomplete Routes

Routes for the fare calculator autocomplete are in the `routes` array per city. Add route objects:

```javascript
routes: [
  { from: 'Badagry', to: 'Marina', km: 42 },
  // ...
]
```

Both `from` and `to` are indexed for autocomplete search — the user can search by either location name.

---

## 7. Database Migrations

All migrations go in `supabase/migrations/`. Name them with a timestamp prefix:

```
supabase/migrations/
  20240101000000_initial_schema.sql
  20240215000000_add_user_profiles.sql
  20240310000000_add_city_ibadan.sql    ← your new migration
```

**Migration template:**

```sql
-- supabase/migrations/20240310000000_add_city_ibadan.sql
-- Description: Add Ibadan fare data and update city constraints

-- Add Ibadan to city check constraint
ALTER TABLE fare_reports
  DROP CONSTRAINT IF EXISTS fare_reports_city_check;

ALTER TABLE fare_reports
  ADD CONSTRAINT fare_reports_city_check
  CHECK (city IN ('Lagos','Abuja','Port Harcourt','Kano','Ibadan'));

-- Seed Ibadan fare index
INSERT INTO fare_index (city, transport_type, route_from, route_to, min_fare, max_fare, verified) VALUES
  ('Ibadan', 'danfo', 'Bodija', 'Dugbe', 120, 350, true),
  ('Ibadan', 'keke',  'Challenge', 'Ring Road', 100, 280, true),
  ('Ibadan', 'okada', 'UI', 'Sango', 300, 600, true);
```

Run locally:

```bash
supabase db push
```

---

## 8. Working with Supabase Edge Functions

Edge Functions are TypeScript/Deno files that run on Supabase's servers.

**Folder structure:**

```
supabase/
  functions/
    traffic-agent/
      index.ts
    fare-agent/
      index.ts
    _shared/
      openrouter.ts    ← shared OpenRouter client
      supabase.ts      ← shared Supabase client
```

**Shared OpenRouter client (`_shared/openrouter.ts`):**

```typescript
export async function callOpenRouter(model: string, system: string, user: string): Promise<string> {
  const key = Deno.env.get('OPENROUTER_KEY')!
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://conductor-ai.ng',
      'X-Title': 'Conductor AI',
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`)
  const data = await response.json()
  return data.choices[0].message.content
}
```

**Local development:**

```bash
# Serve functions locally (requires Docker)
supabase functions serve traffic-agent --env-file .env.local

# Test it
curl http://localhost:54321/functions/v1/traffic-agent
```

**Deploy:**

```bash
supabase functions deploy traffic-agent
supabase functions deploy fare-agent
# etc.
```

---

## 9. Admin Manager Extensions

### Adding a New Panel to the Admin Manager

1. Add a sidebar nav item:

```html
<div class="sb-item" onclick="showPanel('analytics',this)">
  <span class="sb-icon">📈</span>Analytics
</div>
```

2. Add the page panel:

```html
<div class="page-panel" id="panel-analytics">
  <div class="section-title">Platform Analytics</div>
  <!-- content -->
</div>
```

3. If the panel needs data on load, add initialization to `showPanel()`:

```javascript
function showPanel(id, el) {
  // ... existing code ...
  if(id === 'analytics') renderAnalytics();  // ← add this
}
```

### Extending the Update Queue

The update queue accepts any object with `title` and `body` fields. The `type` field controls styling. To add a new update type:

1. Add an entry to `TYPE_COLORS` and `TYPE_ICONS`:

```javascript
const TYPE_COLORS = {
  // ... existing ...
  safety: ['rgba(239,68,68,.1)', 'rgba(239,68,68,.25)', '#EF4444']
}

const TYPE_ICONS = {
  // ... existing ...
  safety: '🛡️'
}
```

That's it — the queue rendering is generic and picks these up automatically.

---

## 10. Code Style and Conventions

### JavaScript

- **No framework, no TypeScript** in the HTML files. Plain ES2020+ JavaScript.
- Use `const` for everything that doesn't change. `let` for mutable values. Never `var`.
- Async/await for all asynchronous operations — no `.then()` chains.
- Arrow functions for callbacks.
- Template literals for HTML string construction.
- Guard clauses over nested if/else:

```javascript
// Good
async function runAgent(agent) {
  if (!isConnected) { showNotif('Connect API first!', 'error'); return; }
  if (!agent) { showNotif('Select an agent', 'error'); return; }
  // ... main logic
}

// Bad
async function runAgent(agent) {
  if (isConnected) {
    if (agent) {
      // ... logic nested 2 levels deep
    }
  }
}
```

### JSON from AI Models

Always wrap JSON parsing in try/catch. Always strip markdown code fences before parsing:

```javascript
try {
  parsed = JSON.parse(result.replace(/```json\n?|\n?```/g, '').trim());
} catch (e) {
  // Fallback: treat the raw text as the update body
  parsed = { updates: [{ title: 'Agent Update', body: result.slice(0, 200), type: agent }] };
}
```

Never crash when a model returns unexpected output. Always have a fallback.

### CSS

- All styles in a single `<style>` block inside each HTML file.
- CSS custom properties (variables) for all colors and repeated values.
- Mobile-first layout using CSS Grid and Flexbox.
- No external CSS frameworks. No Tailwind, no Bootstrap.
- Responsive breakpoints: 768px (mobile) and 1024px (tablet).

### Naming

| Thing | Convention |
|---|---|
| HTML IDs | `camelCase` |
| CSS classes | `kebab-case` |
| JavaScript functions | `camelCase` |
| JavaScript constants | `UPPER_SNAKE_CASE` for config objects, `camelCase` for computed values |
| Supabase table names | `snake_case` |
| Edge Function names | `kebab-case` |

### Commits

```
feat: add Ibadan city with fare data
fix: handle empty JSON response from fare agent
chore: update OpenRouter model list with Llama 3.2
docs: add Edge Function deployment guide to setup page
```

Keep commits atomic. One change per commit.

---

## 11. Testing Your Changes

There is no test suite currently. This is a Phase 2 priority.

**Manual testing checklist before opening a PR:**

- [ ] Open the file in Chrome and Firefox
- [ ] Test on mobile viewport (Chrome DevTools → device toolbar, iPhone 14 size)
- [ ] Run demo mode in the Admin Manager — does the pipeline complete without errors?
- [ ] If you changed fare data, verify the calculator produces correct output
- [ ] If you added a new page/tab, verify navigation works and back-button behavior is correct
- [ ] If you changed Supabase schema, verify the migration runs on a fresh database
- [ ] Check browser console — zero errors, zero warnings

---

## 12. Pull Request Process

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/ibadan-city
   ```

2. Make your changes. Keep scope focused — one feature or fix per PR.

3. Update relevant documentation:
   - New city → update README cities table + setup guide
   - New agent → update README agents table + this CONTRIBUTING.md
   - Schema change → add migration file + update setup guide SQL sections

4. Open the PR with this template:

   **Title:** `feat: add Ibadan city support`

   **Description:**
   ```
   What this PR does:
   - Added Ibadan to CITIES config with 4 transport types and 5 routes
   - Added Ibadan to FARE_DATA in the Admin Manager
   - Added SQL migration for fare_index seed data
   - Updated README cities table

   How to test:
   - Open conductor-ai.html
   - Select Ibadan in the fare calculator
   - Verify routes and fares appear correctly

   Screenshots: [attach mobile + desktop screenshots]
   ```

5. A maintainer will review within 48 hours. Common rejection reasons:
   - Missing documentation updates
   - JSON parsing without try/catch fallback
   - Hardcoded non-Nigerian context in agent prompts
   - Console errors in the browser
   - UI not tested on mobile viewport

---

## 13. Phase 2 Feature Specs

These are planned but unbuilt. If you want to tackle one, comment on the GitHub issue first to avoid duplicate work.

### 13.1 WhatsApp Bot

**Goal:** Users send "FARE LAGOS LEKKI VI" to a WhatsApp number and get a fare estimate back.

**Tech:** Twilio WhatsApp API + Supabase Edge Function

**Approach:**
- Edge Function receives Twilio webhook
- Parses the message for city, origin, destination keywords
- Looks up `fare_index` table
- Replies with formatted fare range
- Falls back to AI Oracle for free-form questions

**Relevant files:** New Edge Function `supabase/functions/whatsapp-bot/index.ts`

### 13.2 USSD Interface

**Goal:** Feature phone users dial `*347*FARE#` to get transport info without internet.

**Tech:** Africa's Talking USSD API + Supabase Edge Function

**Menu structure:**
```
Welcome to Conductor AI
1. Check Fare
2. Traffic Update
3. Report Fare

[1] → Select City → Enter Route → Get Fare
```

**Relevant files:** New Edge Function `supabase/functions/ussd-handler/index.ts`

### 13.3 Push Notifications (PWA)

**Goal:** Users opt in to alerts and receive push notifications for their city.

**Tech:** Service Worker + Push API + Supabase Realtime

**Approach:**
- Add `manifest.json` and `service-worker.js`
- Register service worker in `conductor-ai-live.html`
- Store push subscriptions in new `push_subscriptions` table
- Trigger push from Edge Function when critical alert is created

**New files needed:**
```
manifest.json
service-worker.js
supabase/functions/send-push/index.ts
supabase/migrations/TIMESTAMP_push_subscriptions.sql
```

### 13.4 Verified Reporter System

**Goal:** High-trust users get a verification badge that makes their reports show first.

**Tech:** Supabase `user_profiles` table extension

**Schema addition:**
```sql
ALTER TABLE user_profiles
  ADD COLUMN verified BOOLEAN DEFAULT false,
  ADD COLUMN verification_level INTEGER DEFAULT 0,
  -- 0=basic, 1=community-verified, 2=staff-verified
  ADD COLUMN verified_at TIMESTAMPTZ;
```

**Admin Manager change:** Add verification controls to the Users panel.

### 13.5 Leaderboard → Supabase

**Goal:** Replace the static hardcoded leaderboard with live Supabase data.

**Query:**
```sql
SELECT username, city, points, reports_count, streak
FROM user_profiles
ORDER BY points DESC
LIMIT 50;
```

**Realtime:** Subscribe to `user_profiles` changes so the leaderboard updates live.

---

## 14. Good First Issues

These are well-scoped, low-risk changes suitable for first-time contributors:

| Issue | Complexity | Description |
|---|---|---|
| Add Ibadan city | Low | Add city data to `CITIES` config and `FARE_DATA` |
| Add Kaduna city | Low | Same as above for Kaduna |
| Add Benin City | Low | Same as above for Benin City |
| Ferry transport type | Low | Add ferry data for Lagos waterways |
| Fix mobile tab overflow | Low | Nav tabs overflow on iPhone SE screen size |
| Dark/light mode toggle | Medium | Add CSS class toggle for light mode |
| Export fare data to CSV | Medium | Button in Admin → Fare Editor to export current fares |
| Fare history chart | Medium | Track fare changes over time and chart them |
| Unit tests for fare calculation | Medium | Write Jest/Vitest tests for the `calculateFare()` function |
| Pidgin language prompts | Medium | Improve agent prompt to output more Nigerian Pidgin style |
| Add Owerri city | Low | Add city data for Owerri, Imo State |
| WhatsApp share for alerts | Low | Add WhatsApp share button to alert cards |

To claim an issue: comment on it in GitHub with "I'm working on this."

---

## Questions?

Open a GitHub Discussion or drop in the community feed inside the app. We're building this for Nigeria, together. 🇳🇬🚌
