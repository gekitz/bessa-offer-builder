-- ============================================================
-- User Profiles: Maps Microsoft SSO users to Mesonic Vertreter
-- ============================================================

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  microsoft_email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  -- Mesonic mapping
  mesonic_rep_id TEXT,                -- Sales rep number (Vertreternummer) in WinLine
  mesonic_rep_name TEXT,              -- Sales rep display name in Mesonic
  -- Ticket system
  pools TEXT[] DEFAULT '{}',          -- e.g. {'kassen','it','netzwerk'}
  -- Access control
  role TEXT NOT NULL DEFAULT 'agent'  -- admin | agent | viewer
    CHECK (role IN ('admin', 'agent', 'viewer')),
  -- Meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_user_profiles_email ON user_profiles(microsoft_email);
CREATE INDEX idx_user_profiles_rep ON user_profiles(mesonic_rep_id);
CREATE INDEX idx_user_profiles_role ON user_profiles(role);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();

-- ============================================================
-- Ticket pool definitions
-- ============================================================

CREATE TABLE ticket_pools (
  id TEXT PRIMARY KEY,              -- e.g. 'kassen', 'it', 'netzwerk'
  name TEXT NOT NULL,               -- Display name: 'Kassensysteme'
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default pools
INSERT INTO ticket_pools (id, name, description) VALUES
  ('kassen', 'Kassensysteme', 'POS Hardware & Software Support'),
  ('it', 'IT', 'Allgemeine IT-Infrastruktur'),
  ('netzwerk', 'Netzwerk', 'Netzwerk & Konnektivität');

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_pools ENABLE ROW LEVEL SECURITY;

-- user_profiles: all authenticated users can read all profiles
CREATE POLICY "Authenticated can read all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

-- user_profiles: authenticated users can insert their own profile
CREATE POLICY "Authenticated can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- user_profiles: authenticated users can update (admin enforcement in app layer)
CREATE POLICY "Authenticated can update profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (true);

-- ticket_pools: all authenticated users can read
CREATE POLICY "Authenticated can read pools"
  ON ticket_pools FOR SELECT
  TO authenticated
  USING (true);

-- ticket_pools: all authenticated users can manage (admin enforcement in app layer)
CREATE POLICY "Authenticated can manage pools"
  ON ticket_pools FOR ALL
  TO authenticated
  USING (true);

-- ============================================================
-- Auto-create user_profile on first sign-in
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, microsoft_email, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'preferred_username',
      split_part(COALESCE(NEW.email, ''), '@', 1),
      'Unknown'
    ),
    NEW.raw_user_meta_data->>'picture'
  )
  ON CONFLICT (id) DO UPDATE SET
    microsoft_email = EXCLUDED.microsoft_email,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
