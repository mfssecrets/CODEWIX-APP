-- =============================================================
-- CodeWIX Initial Schema — Supabase PostgreSQL
-- =============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- PROFILES (replaces Users table — Supabase Auth manages auth)
-- =============================================================
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );
  -- Auto-assign Starter plan
  INSERT INTO public.user_subscriptions (user_id, plan_id, status)
  SELECT NEW.id, p.id, 'active'
  FROM public.plans p WHERE p.slug = 'starter' LIMIT 1;
  -- Grant free tokens for Starter plan
  INSERT INTO public.token_balances (user_id, total_tokens, tokens_used)
  SELECT NEW.id, p.monthly_tokens, 0
  FROM public.plans p WHERE p.slug = 'starter' LIMIT 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- PLANS (subscription tiers)
-- =============================================================
CREATE TABLE public.plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  price_monthly   DECIMAL(10,2) NOT NULL,
  price_yearly    DECIMAL(10,2),
  monthly_tokens  INTEGER NOT NULL DEFAULT 0,
  max_projects    INTEGER NOT NULL DEFAULT 1,
  max_file_size   INTEGER NOT NULL DEFAULT 5242880, -- 5MB
  features        JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed plans
INSERT INTO public.plans (name, slug, price_monthly, price_yearly, monthly_tokens, max_projects, max_file_size, features) VALUES
('Starter', 'starter', 2.00, 20.00, 50, 3, 5242880, '["50 AI tokens/month", "3 projects", "5MB file upload", "Email support", "Basic AI models"]'::jsonb),
('Pro', 'pro', 6.00, 60.00, 500, 20, 26214400, '["500 AI tokens/month", "20 projects", "25MB file upload", "Priority support", "All AI models", "Code execution", "Version history"]'::jsonb),
('Pro Max', 'pro-max', 15.00, 150.00, 5000, 999, 104857600, '["5000 AI tokens/month", "Unlimited projects", "100MB file upload", "Dedicated support", "All AI models", "Priority code execution", "Full version history", "GitHub integration", "Custom domains", "API access"]'::jsonb);

-- =============================================================
-- USER SUBSCRIPTIONS
-- =============================================================
CREATE TABLE public.user_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id         UUID NOT NULL REFERENCES public.plans(id),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'paused')),
  razorpay_sub_id TEXT UNIQUE,
  razorpay_cust_id TEXT,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  canceled_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TRIGGER user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- TOKEN BALANCES
-- =============================================================
CREATE TABLE public.token_balances (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  total_tokens  INTEGER NOT NULL DEFAULT 50,
  tokens_used   INTEGER NOT NULL DEFAULT 0,
  reset_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER token_balances_updated_at BEFORE UPDATE ON public.token_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- TOKEN USAGE LOG
-- =============================================================
CREATE TABLE public.token_usage (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tokens_used   INTEGER NOT NULL DEFAULT 1,
  action        TEXT NOT NULL DEFAULT 'chat',
  project_id    UUID,
  conversation_id UUID,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- BILLING ADDRESSES
-- =============================================================
CREATE TABLE public.billing_addresses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  line1       TEXT NOT NULL,
  line2       TEXT,
  city        TEXT NOT NULL,
  state       TEXT,
  postal_code TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'IN',
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER billing_addresses_updated_at BEFORE UPDATE ON public.billing_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- CONVERSATIONS
-- =============================================================
CREATE TABLE public.conversations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL DEFAULT 'chat',
  title          TEXT NOT NULL DEFAULT 'New Conversation',
  model_id       TEXT,
  provider       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- MESSAGES
-- =============================================================
CREATE TABLE public.messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- ATTACHMENTS
-- =============================================================
CREATE TABLE public.attachments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id      UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_type       TEXT,
  file_size       INTEGER NOT NULL,
  mime_type       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- AGENT TASKS
-- =============================================================
CREATE TABLE public.agent_tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'planning',
  activity        TEXT NOT NULL DEFAULT 'Planning',
  output          TEXT NOT NULL DEFAULT '',
  files           JSONB NOT NULL DEFAULT '{}'::jsonb,
  build_status    TEXT NOT NULL DEFAULT 'pending',
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER agent_tasks_updated_at BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- MODEL CONFIGS
-- =============================================================
CREATE TABLE public.model_configs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  api_key      TEXT NOT NULL,
  model_id     TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER model_configs_updated_at BEFORE UPDATE ON public.model_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- PROJECTS
-- =============================================================
CREATE TABLE public.projects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  github_repo  TEXT,
  github_branch TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- PROJECT FILES
-- =============================================================
CREATE TABLE public.project_files (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  language   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, path)
);

CREATE TRIGGER project_files_updated_at BEFORE UPDATE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- PROJECT VERSIONS
-- =============================================================
CREATE TABLE public.project_versions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  files      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- BUILDER CONVERSATIONS
-- =============================================================
CREATE TABLE public.builder_conversations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New Conversation',
  model_id   TEXT,
  provider   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER builder_conversations_updated_at BEFORE UPDATE ON public.builder_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================
-- BUILDER MESSAGES
-- =============================================================
CREATE TABLE public.builder_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.builder_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  activity        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- PAYMENT RECORDS
-- =============================================================
CREATE TABLE public.payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES public.user_subscriptions(id),
  razorpay_pay_id   TEXT UNIQUE,
  razorpay_order_id TEXT UNIQUE,
  amount            DECIMAL(10,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'INR',
  status            TEXT NOT NULL DEFAULT 'created',
  plan_id           UUID REFERENCES public.plans(id),
  billing_address_id UUID REFERENCES public.billing_addresses(id),
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_agent_tasks_conversation_id ON public.agent_tasks(conversation_id);
CREATE INDEX idx_model_configs_user_id ON public.model_configs(user_id);
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_project_files_project_id ON public.project_files(project_id);
CREATE INDEX idx_project_versions_project_id ON public.project_versions(project_id);
CREATE INDEX idx_builder_conversations_project_id ON public.builder_conversations(project_id);
CREATE INDEX idx_builder_messages_conversation_id ON public.builder_messages(conversation_id);
CREATE INDEX idx_token_usage_user_id ON public.token_usage(user_id);
CREATE INDEX idx_token_usage_created_at ON public.token_usage(created_at DESC);
CREATE INDEX idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_billing_addresses_user_id ON public.billing_addresses(user_id);

-- =============================================================
-- RLS POLICIES
-- =============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Plans: public read
CREATE POLICY "Plans are publicly readable" ON public.plans
  FOR SELECT USING (true);

-- Profiles: users can read all, update own
CREATE POLICY "Profiles selectable by all" ON public.profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- User subscriptions: users read own only
CREATE POLICY "Users read own subscription" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own subscription" ON public.user_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own subscription" ON public.user_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Token balances: users read/update own only
CREATE POLICY "Users read own token balance" ON public.token_balances
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own token balance" ON public.token_balances
  FOR UPDATE USING (auth.uid() = user_id);

-- Token usage: users read own, insert own
CREATE POLICY "Users read own token usage" ON public.token_usage
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own token usage" ON public.token_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Billing addresses: users CRUD own only
CREATE POLICY "Users read own billing addresses" ON public.billing_addresses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own billing addresses" ON public.billing_addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own billing addresses" ON public.billing_addresses
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own billing addresses" ON public.billing_addresses
  FOR DELETE USING (auth.uid() = user_id);

-- Conversations: users CRUD own only
CREATE POLICY "Users read own conversations" ON public.conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own conversations" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own conversations" ON public.conversations
  FOR DELETE USING (auth.uid() = user_id);

-- Messages: users read/insert own conversation messages
CREATE POLICY "Users read messages in own conversations" ON public.messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Users insert messages in own conversations" ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Users delete messages in own conversations" ON public.messages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );

-- Attachments: same pattern as messages
CREATE POLICY "Users read attachments in own messages" ON public.attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = message_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY "Users insert attachments in own messages" ON public.attachments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = message_id AND c.user_id = auth.uid()
    )
  );

-- Agent tasks: same pattern
CREATE POLICY "Users read agent tasks in own conversations" ON public.agent_tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Users insert agent tasks in own conversations" ON public.agent_tasks
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Users update agent tasks in own conversations" ON public.agent_tasks
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );

-- Model configs: users CRUD own only
CREATE POLICY "Users read own model configs" ON public.model_configs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own model configs" ON public.model_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own model configs" ON public.model_configs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own model configs" ON public.model_configs
  FOR DELETE USING (auth.uid() = user_id);

-- Projects: users CRUD own only
CREATE POLICY "Users read own projects" ON public.projects
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own projects" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own projects" ON public.projects
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own projects" ON public.projects
  FOR DELETE USING (auth.uid() = user_id);

-- Project files: same pattern via projects
CREATE POLICY "Users read files in own projects" ON public.project_files
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Users insert files in own projects" ON public.project_files
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Users update files in own projects" ON public.project_files
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Users delete files in own projects" ON public.project_files
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

-- Project versions: same pattern
CREATE POLICY "Users read versions in own projects" ON public.project_versions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Users insert versions in own projects" ON public.project_versions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

-- Builder conversations: same pattern
CREATE POLICY "Users read builder convos in own projects" ON public.builder_conversations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Users insert builder convos in own projects" ON public.builder_conversations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );
CREATE POLICY "Users update builder convos in own projects" ON public.builder_conversations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

-- Builder messages: same pattern
CREATE POLICY "Users read builder msgs in own projects" ON public.builder_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.builder_conversations bc
      JOIN public.projects p ON p.id = bc.project_id
      WHERE bc.id = conversation_id AND p.user_id = auth.uid()
    )
  );
CREATE POLICY "Users insert builder msgs in own projects" ON public.builder_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.builder_conversations bc
      JOIN public.projects p ON p.id = bc.project_id
      WHERE bc.id = conversation_id AND p.user_id = auth.uid()
    )
  );

-- Payments: users read own, service role inserts
CREATE POLICY "Users read own payments" ON public.payments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own payments" ON public.payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own payments" ON public.payments
  FOR UPDATE USING (auth.uid() = user_id);

-- =============================================================
-- STORAGE BUCKETS
-- =============================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('uploads', 'uploads', false),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id IN ('uploads', 'avatars') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own uploads" ON storage.objects
  FOR SELECT USING (
    (bucket_id = 'avatars') OR
    (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text)
  );

CREATE POLICY "Users can delete own uploads" ON storage.objects
  FOR DELETE USING (
    (storage.foldername(name))[1] = auth.uid()::text
  );
