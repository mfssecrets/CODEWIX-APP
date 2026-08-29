# CodeWIX — Complete Documentation

> **CodeWIX** is an AI-powered code generation platform. Describe your idea and let AI build your website, web app, or mobile app. Built with Next.js 16 + Supabase + Cloudflare Workers, with multi-provider AI (Google Gemini for Chat, Cerebras + OpenRouter for Agent/Build).
>
> **Live site:** https://codewix.in
> **Repo:** https://github.com/mfssecrets/CODEWIX-APP

---

## Table of Contents
1. [What is CodeWIX](#1-what-is-codewix)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [AI Provider Architecture](#4-ai-provider-architecture)
5. [Authentication Flow](#5-authentication-flow)
6. [Token & Free Tier System](#6-token--free-tier-system)
7. [Routing & Pages](#7-routing--pages)
8. [API Reference (all 27 routes)](#8-api-reference)
9. [Component Library](#9-component-library)
10. [Database Schema](#10-database-schema)
11. [Environment Variables](#11-environment-variables)
12. [GitHub Repo Secrets (REQUIRED)](#12-github-repo-secrets-required)
13. [Deployment (Cloudflare Workers)](#13-deployment-cloudflare-workers)
14. [User Flows (end-to-end)](#14-user-flows)
15. [File-by-File Reference](#15-file-by-file-reference)

---

## 1. What is CodeWIX

CodeWIX lets users build software by describing it in natural language. It offers three workspaces:

| Workspace | Purpose | AI Provider |
|---|---|---|
| **Chat** (`/chat`) | General AI assistant — ask anything, with image & document attachments | Google Gemini |
| **Agent** (`/agent`) | Autonomous coding agent — describes a plan, then **Build** opens the Build Studio IDE | Cerebras + OpenRouter |
| **Build** (`/build/[projectId]`) | Full in-browser IDE (Monaco editor + file tree + live preview) — AI generates files via tool-calls | Cerebras + OpenRouter |

Supporting pages: landing (`/`), auth (`/signin`, `/signup`), `/history`, `/pricing`, `/settings/models`.

---

## 2. Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript 5
- **Styling:** Tailwind CSS 4 + shadcn/ui (New York style) + Framer Motion
- **3D background:** three.js (`@react-three/fiber` + `@react-three/drei`)
- **Code editor:** `@monaco-editor/react`
- **Database + Auth:** Supabase (Postgres + Auth email OTP + Storage)
- **AI providers:** Google Gemini, Cerebras, OpenRouter (OpenAI-compatible)
- **Email:** Resend (transactional welcome email)
- **Payments:** Razorpay (live keys)
- **Deployment:** Cloudflare Workers via `@opennextjs/cloudflare` + `wrangler`
- **CI/CD:** GitHub Actions (bun-based build + wrangler deploy + secret binding)

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (client)                      │
│  ─ Next.js App Router pages (React 19)                   │
│  ─ Supabase browser client (auth, RLS queries)           │
│  ─ SSE stream readers for chat/agent/build AI            │
└───────────────┬─────────────────────────────────────────┘
                │ fetch('/api/...') + cookies
                ▼
┌─────────────────────────────────────────────────────────┐
│            Cloudflare Worker (Next.js standalone)        │
│  ─ Route Handlers (/api/*) — server-side only            │
│  ─ Middleware (proxy.ts) — Supabase SSR auth gating       │
│  ─ Reads secrets from Worker env (wrangler secrets)      │
└───────────────┬─────────────────────────────────────────┘
                │
      ┌─────────┼─────────┬──────────────┐
      ▼         ▼         ▼              ▼
  ┌──────┐ ┌────────┐ ┌──────────┐ ┌──────────┐
  │Supabase│ │ Gemini │ │ Cerebras │ │OpenRouter│
  │(DB/Auth│ │(Chat)  │ │(Agent/   │ │(Agent/   │
  │/Storage)│ │       │ │ Build)   │ │ Build)   │
  └──────┘ └────────┘ └──────────┘ └──────────┘
```

**No localStorage / no localhost** — all state is in Supabase (Postgres), all URLs use the `codewix.in` domain.

---

## 4. AI Provider Architecture

Defined in `src/lib/ai-providers.ts`. Operator-provided platform keys, server-side only. Users never enter API keys; they pick a model from the picker (like Google AI Studio).

### Chat models (`category: 'chat'`) — powered by `GEMINI_API_KEY`
| Model ID | Display name | Provider | Default |
|---|---|---|---|
| `gemini-3.6-flash` | Gemini 3.6 Flash | google | ✅ |
| `gemini-3.1-pro-preview` | Gemini 3.1 Pro (Preview) | google | |
| `gemini-3.5-flash-lite` | Gemini 3.5 Flash-Lite | google | |

### Coding models (`category: 'code'`) — power Agent + Build Studio
| Model ID | Display name | Provider | Default |
|---|---|---|---|
| `llama-3.3-70b` | Llama 3.3 70B | cerebras | ✅ |
| `llama3.1-8b` | Llama 3.1 8B | cerebras | |
| `qwen-3-coder-30b` | Qwen 3 Coder 30B | cerebras | |
| `z-ai/glm-5.2:free` | GLM 5.2 | openrouter | |
| `cohere/north-mini-code:free` | Cohere North Mini Code | openrouter | |
| `google/gemma-4-31b-it:free` | Gemma 4 31B | openrouter | |
| `nvidia/nemotron-3-super-120b-a12b:free` | Nemotron 3 Super 120B | openrouter | |

- **Gemini** uses native `streamGenerateContent` SSE.
- **Cerebras + OpenRouter** use OpenAI-compatible `/chat/completions` SSE (shared `streamOpenAICompatible`).
- `streamChat(model, messages)` dispatches by `model.provider`.
- `getModelById(userId, modelId, categoryHint)` resolves with fallback to the category default.

---

## 5. Authentication Flow

**Pure 6-digit email OTP** — no passwords, no magic links, anywhere.

1. **Sign in / Sign up:** user enters email → `supabase.auth.signInWithOtp({ email })`.
2. Supabase sends a 6-digit code (email template uses `{{ .Token }}`, NOT `{{ .ConfirmationURL }}`).
3. User enters the code → `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
4. Session cookie (`sb-<ref>-auth-token`, base64url-encoded) is set.
5. **Middleware** (`src/middleware.ts`) calls `supabase.auth.getUser()` on every request:
   - Public: `/`, `/signin`, `/signup`, `/pricing`, `/api/billing/plans`, `/api/auth/callback`.
   - Protected: `/chat`, `/agent`, `/build`, `/history`, `/settings` (redirect to `/signin?redirectTo=...` if no user).
6. **Forgot password** — removed (OTP-only app). `/forgot-password` redirects to `/signin`.
7. **Welcome email** — fired after signup via `POST /api/email/welcome` (Resend).

---

## 6. Token & Free Tier System

Defined in `src/lib/tokens.ts`. Every AI action is gated by the token system.

### Free tier (NEW)
- **The first 5 Chat + Agent prompts are FREE** for every user (lifetime, across both Chat and Agent combined).
- The 6th onward consumes plan tokens.
- **Builder (file-generation) actions are NOT free** — they always consume 1 plan token each.
- Tracked via the `token_usage` table: free prompts log `tokens_used: 0`; paid prompts log `tokens_used: 1`.

### Plan tokens (monthly)
| Plan | Price | Monthly tokens | Max projects |
|---|---|---|---|
| Starter | $0 | 2 | 1 |
| Pro | $6/mo | 500 | 20 |
| Pro Max | $15/mo | 5000 | unlimited |

- Tokens reset monthly (auto-reset when `reset_at` passes).
- `checkAndConsumeToken(userId, { action })` is the single entry point used by `/api/chat`, `/api/agent`, `/api/projects/[id]/ai`.

---

## 7. Routing & Pages

### Route groups (URL-invisible)
- `(auth)` — auth pages on the 3D background
- `(workspace)` — app shell with sidebar (Chat, Agent, Build, History, Pricing, Models)
- `(ide)` — full-screen IDE (Build Studio, no sidebar)

### Pages
| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Landing: 3D background, hero with prompt input, templates, integrations |
| `/signin` | `(auth)/signin/SigninContent.tsx` | Email → 6-digit OTP |
| `/signup` | `(auth)/signup/page.tsx` | Name + Email → 6-digit OTP |
| `/forgot-password` | `(auth)/forgot-password/page.tsx` | Redirects to `/signin` |
| `/chat` | `(workspace)/chat/page.tsx` → `ChatWorkspace.tsx` | Streaming chat (Gemini) |
| `/chat/[conversationId]` | `(workspace)/chat/[conversationId]/page.tsx` | Same ChatWorkspace, loads history |
| `/agent` | `(workspace)/agent/page.tsx` → `AgentWorkspace.tsx` | Agent with timeline + **Build** button |
| `/agent/[conversationId]` | `(workspace)/agent/[conversationId]/page.tsx` | Same AgentWorkspace |
| `/build` | `(workspace)/build/page.tsx` | Project grid + New Project modal |
| `/build/[projectId]` | `(ide)/build/[projectId]/page.tsx` | **Build Studio IDE** (Monaco + preview + AI) |
| `/history` | `(workspace)/history/page.tsx` | Conversation history (search, rename, delete) |
| `/pricing` | `(workspace)/pricing/page.tsx` | 3-plan grid + Razorpay checkout |
| `/settings/models` | `(workspace)/settings/models/page.tsx` | Read-only platform model list |

---

## 8. API Reference

All routes under `/api/`. Auth via Supabase cookie (`getUser()`); return 401 if no user (except public routes).

### Core
| Method | Route | Purpose |
|---|---|---|
| GET | `/api` | Health check → `{"message":"Hello, world!"}` |
| GET | `/api/auth/callback` | OAuth/email-link code exchange (legacy) |
| GET | `/api/user/profile` | User + profile + subscription + token balance |
| GET | `/api/tokens` | Current token balance |
| POST | `/api/email/welcome` | Send welcome email (Resend) |

### Models
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/models?category=chat\|code` | Platform models (apiKey: null). `chat` = Gemini, `code` = Cerebras + OpenRouter |
| POST | `/api/models` | Disabled (platform-managed) |
| PATCH/DELETE | `/api/models/[modelId]` | No-op success (platform-managed) |

### Chat
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/conversations` | Create empty chat conversation |
| POST | `/api/chat` | Streaming chat (SSE). Free-tier aware. Defaults to Gemini. |
| GET | `/api/chat/[conversationId]` | Load conversation + messages + attachments |
| PATCH | `/api/chat/[conversationId]` | Rename conversation |
| DELETE | `/api/chat/[conversationId]` | Delete conversation |
| GET | `/api/history` | Paginated conversation list (search) |

### Agent
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/agent` | Streaming agent (SSE with status + content). Free-tier aware. Defaults to a code model. |
| GET | `/api/agent/[conversationId]` | Load agent conversation + tasks |

### Projects + Build Studio
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/build` | All projects with counts |
| GET/POST | `/api/projects` | List / create project (quota-checked) |
| GET/PATCH/DELETE | `/api/projects/[projectId]` | Project CRUD |
| GET/POST | `/api/projects/[projectId]/files` | File list / upsert |
| GET/PUT/DELETE | `/api/projects/[projectId]/files/[...filePath]` | File CRUD by path |
| GET/POST | `/api/projects/[projectId]/versions` | Version snapshots |
| GET/POST | `/api/projects/[projectId]/builder-conversations` | Builder convos |
| GET/DELETE | `/api/projects/[projectId]/builder-conversations/[convoId]` | Builder convo CRUD |
| POST | `/api/projects/[projectId]/ai` | **Build AI** — streams tool-calls (readFile/writeFile/createFile/deleteFile/searchFiles/installDeps). Consumes 1 token. |
| GET | `/api/projects/[projectId]/export` | ZIP download (JSZip) |
| POST | `/api/upload` | File upload (10MB cap) |

### Billing
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/billing/plans` | Public — list 3 plans (Starter/Pro/Pro Max) |
| POST | `/api/billing/subscribe` | Create Razorpay order |
| GET | `/api/billing/portal` | Subscription + payment history |
| POST | `/api/billing/webhook` | Razorpay webhook (HMAC-SHA256 verify) |

---

## 9. Component Library

### Custom (`src/components/codewix/`)
| Component | Purpose |
|---|---|
| `Background3D.tsx` | three.js neural nodes + particle field (landing, auth, workspace) |
| `Sidebar.tsx` | Landing-page sidebar nav |
| `Header.tsx` | Landing-page header (logo, online, sign-in/dashboard) |
| `HeroSection.tsx` | Hero with prompt input → `/chat?prompt=` |
| `TemplatesSection.tsx` | 4 starter template cards |
| `IntegrationsSection.tsx` | Figma/Supabase/GitHub/Vercel/Drive chips |
| `AuthCard.tsx` | Glass card wrapper for auth pages |
| `ChatWorkspace.tsx` | Streaming chat UI (messages, attachments, model picker, stop/regen) |
| `AgentWorkspace.tsx` | Agent UI (timeline + **Chat** + **Build** buttons) |

### shadcn/ui (`src/components/ui/`)
45 primitives: accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toaster, toggle, toggle-group, tooltip.

### Providers
| File | Purpose |
|---|---|
| `src/components/Providers.tsx` | `AppProvider` context (`useUser`): `{user, profile, session, loading, signOut, refreshProfile}`. Subscribes to `supabase.auth.onAuthStateChange`. |

---

## 10. Database Schema

Single Supabase migration (`supabase/migrations/20240828000000_initial_schema.sql`). 17 tables, RLS on all:

| Table | Purpose |
|---|---|
| `profiles` | User profile (name, avatar_url) — auto-created on signup via `handle_new_user` trigger |
| `plans` | 3 seeded plans (Starter/Pro/Pro Max) |
| `user_subscriptions` | Active plan per user |
| `token_balances` | `total_tokens`, `tokens_used`, `reset_at` |
| `token_usage` | Per-action log (action, tokens_used, project_id, conversation_id) |
| `billing_addresses` | Billing address (optional) |
| `conversations` | Chat/agent conversations |
| `messages` | Messages (role, content) — uses `created_at`, not `timestamp` |
| `attachments` | File attachments (uploads) |
| `agent_tasks` | Agent run state (status, activity, output) |
| `model_configs` | Legacy per-user model keys (now unused; platform-managed) |
| `projects` | Build Studio projects |
| `project_files` | Files (path, content, language) — UNIQUE(project_id, path) |
| `project_versions` | Version snapshots (files as JSONB) |
| `builder_conversations` | Per-project AI conversations |
| `builder_messages` | Builder messages (role, content, activity) |
| `payments` | Razorpay payment records |

**Storage buckets:** `uploads` (private), `avatars` (public).

---

## 11. Environment Variables

### Server-side secrets (NEVER exposed to client)
| Var | Required | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Bypasses RLS for privileged ops |
| `GEMINI_API_KEY` | ✅ | Chat mode (Gemini) |
| `CEREBRAS_API_KEY` | ✅ | Agent/Build (Cerebras) |
| `OPENROUTER_API_KEY` | ✅ | Agent/Build (OpenRouter) |
| `RESEND_API_KEY` | ✅ | Transactional email |
| `RAZORPAY_KEY_ID` | for billing | Razorpay public id |
| `RAZORPAY_KEY_SECRET` | for billing | Razorpay secret (HMAC webhook verify) |
| `ENCRYPTION_KEY` | ✅ | 32-char key (legacy per-user key obfuscation) |

### Public / non-secret
| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (inlined at build; code has fallback) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (inlined at build; code has fallback — RLS-protected) |
| `NEXT_PUBLIC_SITE_URL` | `https://codewix.in` |
| `DOMAIN` | `CODEWIX.IN` |
| `GEMINI_DEFAULT_MODEL` | `gemini-3.6-flash` |
| `RESEND_FROM_EMAIL` | `CodeWIX <noreply@codewix.in>` |
| `NODE_ENV` | `production` |

Code fallbacks for `NEXT_PUBLIC_*` are in `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts` — the anon key is public by design (RLS-protected).

---

## 12. GitHub Repo Secrets (REQUIRED)

Set in **GitHub repo > Settings > Secrets and variables > Actions > New repository secret**. The GitHub Actions workflow (`deploy-cloudflare.yml`) binds these to the Worker via `wrangler secret put` on every deploy.

| Secret name | Value | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | (your Cloudflare API token) | Deploy the Worker |
| `CLOUDFLARE_ACCOUNT_ID` | (your Cloudflare account id) | Deploy the Worker |
| `SUPABASE_SERVICE_ROLE_KEY` | `<your-supabase-service-role-key>` | Bypass RLS |
| `GEMINI_API_KEY` | `<your-gemini-api-key>` | Chat mode AI |
| `CEREBRAS_API_KEY` | `<your-cerebras-api-key>` | Agent/Build AI |
| `OPENROUTER_API_KEY` | `<your-openrouter-api-key>` | Agent/Build AI |
| `RESEND_API_KEY` | `<your-resend-api-key>` | Welcome email |
| `RAZORPAY_KEY_ID` | `<your-razorpay-key-id>` | Billing |
| `RAZORPAY_KEY_SECRET` | `<your-razorpay-key-secret>` | Billing webhook |
| `ENCRYPTION_KEY` | `<your-32-char-encryption-key>` | Legacy key obfuscation |

**Optional GitHub repo variables** (Settings > Secrets and variables > Actions > Variables):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

(Code has fallbacks for these, but setting them is recommended.)

---

## 13. Deployment (Cloudflare Workers)

### Pipeline (GitHub Actions: `.github/workflows/deploy-cloudflare.yml`)
1. **Checkout** the repo
2. **Setup Bun** (`oven-sh/setup-bun@v2`)
3. **Install** (`bun install`)
4. **Build** (`bun run build` → `node scripts/build.mjs` → `@opennextjs/cloudflare build`) — produces `.open-next/worker.js`
5. **Deploy** (`cloudflare/wrangler-action@v3` → `wrangler deploy`)
6. **Bind secrets** (`wrangler secret put` for each GitHub secret)

### Config files
- `wrangler.toml` — Worker name (`codewix-app`), entry (`.open-next/worker.js`), `[vars]` for non-secret runtime vars
- `open-next.config.ts` — OpenNext Cloudflare adapter config
- `scripts/build.mjs` — guards against OpenNext build recursion
- `next.config.ts` — `output: 'standalone'`, `ignoreBuildErrors: true`

### Domain
`codewix.in` is bound to the Cloudflare Worker (Workers & Pages > codewix-app > Domains).

---

## 14. User Flows

### Flow 1: Sign up
1. Visit `/signup` → enter name + email → click "Create Account"
2. Supabase sends 6-digit OTP → enter code → "Verify & Create Account"
3. Welcome email fires (Resend) → redirect to `/chat`
4. `handle_new_user` trigger creates profile + Starter subscription + 50 free tokens

### Flow 2: Chat (Gemini)
1. Visit `/chat` → model picker shows 3 Gemini models (default: Gemini 3.6 Flash)
2. Type message → "Send Code" → `POST /api/chat` (SSE stream)
3. First 5 chats are FREE; 6th consumes 1 plan token
4. Assistant reply streams in; title auto-generated for new conversations

### Flow 3: Agent → Build Studio (the flagship flow)
1. Visit `/agent` → model picker shows 7 coding models (default: Llama 3.3 70B Cerebras)
2. Type "Build a landing page with a hero and a button"
3. Click **Build** (Hammer icon, primary gradient):
   - `POST /api/projects` creates a project
   - Navigates to `/build/[projectId]?prompt=<encoded prompt>`
4. Build Studio IDE loads (Monaco + file tree + live preview)
5. Models load → prompt auto-fires to `POST /api/projects/[id]/ai` (consumes 1 token)
6. AI streams a `createFile`/`writeFile` tool-call → file appears in the tree + editor
7. User can edit, preview (desktop/tablet/mobile), export ZIP, view version history
8. Alternatively, click **Chat** for a markdown walkthrough (free-tier applies)

### Flow 4: Pricing
1. Visit `/pricing` → 3 plans render (Starter $0, Pro $6, Pro Max $15)
2. Current plan badge shows if subscribed
3. Click "Upgrade" → `POST /api/billing/subscribe` → Razorpay checkout modal
4. On success → webhook upgrades the subscription + token balance

---

## 15. File-by-File Reference

### `src/lib/`
| File | Purpose |
|---|---|
| `ai-providers.ts` | 3 providers (google/cerebras/openrouter), 10 models, category-aware resolution, `streamChat`, `generateTitle` |
| `supabase/server.ts` | `createClient` (anon, cookies), `createServiceClient` (supabase-js, service role), `createMiddlewareClient` |
| `supabase/client.ts` | `createBrowserClient` with public config fallbacks |
| `tokens.ts` | `getAvailableTokens`, `consumeToken`, `checkAndConsumeToken` (free-tier aware), `getFreePromptCount` |
| `subscription.ts` | `getPlans`, `getUserSubscription`, `canCreateProject`, `upgradeSubscription` |
| `email.ts` | `sendEmail` (Resend REST), `sendWelcomeEmail` |
| `crypto.ts` | `encrypt`/`decrypt`/`maskApiKey` (XOR obfuscation, legacy) |
| `language-detect.ts` | extension → Monaco language id |
| `utils.ts` | `cn()` = twMerge(clsx(...)) |

### `src/hooks/`
| File | Purpose |
|---|---|
| `use-mobile.ts` | `useIsMobile()` (768px breakpoint) |
| `use-toast.ts` | shadcn toast store (in-memory reducer + pub/sub) |

### `src/middleware.ts`
Supabase SSR auth gating — public paths + protected prefixes.

---

## Navigation & Buttons Summary

### Landing (`/`)
- Sidebar: Chat, Agent, Build, New Project, AI Templates, Settings
- Header: Logo, ONLINE, Sign in, Get Started
- Hero: prompt input → `/chat?prompt=` (or `/signup` if not authed)
- Templates: 4 cards (Landing, SaaS Dashboard, E-commerce, Portfolio)
- Integrations: 5 chips (Figma, Supabase, GitHub, Vercel, Google Drive)

### Workspace sidebar
- Chat, Agent, Build, History, Pricing, Models
- Token indicator (available / total)
- User profile (name, email, Sign out)
- Back button (`‹`)

### Chat workspace
- Header: "Chat" + New + model picker (Gemini models)
- Messages: user/assistant bubbles, copy/edit/delete actions
- Input: textarea, paperclip (attachments), send button, Stop while streaming

### Agent workspace
- Header: "Agent" + New + model picker (Cerebras + OpenRouter models)
- Empty state: "AI Coding Agent" + explanation of Build vs Chat
- Timeline: planning → analyzing → creating → editing → testing → fixing → completed
- Input: textarea, paperclip, **Chat** button (markdown), **Build** button (opens Build Studio)

### Build Studio (`/build/[projectId]`)
- Top bar: Back to projects, project name (editable), Preview/Code toggle, Refresh, GitHub, Export, Settings
- Left: AI Assistant panel — model picker, New conversation, message list, textarea, send button
- Center: Monaco editor with file tabs
- Right: file tree (new file/folder, search, context menu)
- Live preview: desktop/tablet/mobile viewport toggle
- Version history, diff view for AI changes

### Settings > Models
- Read-only platform model list (no add/delete)
- Shows all 10 models with Default/Active badges + Vision/Stream tags
- Info banner: "Platform-managed AI models"

### Pricing
- "Choose Your Plan" heading
- 3 plan cards (Starter, Pro, Pro Max) with features + Upgrade buttons
- Current plan badge
- Razorpay checkout modal on Upgrade

---

*Generated for CodeWIX. Last updated: 2026-08-29.*
