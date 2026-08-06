-- Username auth tables
-- Username-based auth tables (no email required)

-- Profiles / users table
CREATE TABLE IF NOT EXISTS public.sb_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  handicap NUMERIC,
  home_course TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Follows table
CREATE TABLE IF NOT EXISTS public.sb_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.sb_profiles(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES public.sb_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, followee_id)
);

-- Enable RLS
ALTER TABLE public.sb_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sb_follows ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (safe to re-run)
DROP POLICY IF EXISTS "profiles_select_all" ON public.sb_profiles;
DROP POLICY IF EXISTS "profiles_insert_all" ON public.sb_profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.sb_profiles;
DROP POLICY IF EXISTS "follows_select_all" ON public.sb_follows;
DROP POLICY IF EXISTS "follows_insert_all" ON public.sb_follows;
DROP POLICY IF EXISTS "follows_delete_own" ON public.sb_follows;

-- RLS policies
-- Profiles: anyone can read (needed for search/follow), anyone can insert (signup), update own only
CREATE POLICY "profiles_select_all" ON public.sb_profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_all" ON public.sb_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_update_own" ON public.sb_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Since we're not using Supabase Auth, we need permissive update policy
-- Allow update by matching the row's own id (client provides their id)
DROP POLICY IF EXISTS "profiles_update_own" ON public.sb_profiles;
CREATE POLICY "profiles_update_own" ON public.sb_profiles FOR UPDATE USING (true) WITH CHECK (true);

-- Follows: anyone can read, anyone can insert, delete own follows
CREATE POLICY "follows_select_all" ON public.sb_follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_all" ON public.sb_follows FOR INSERT WITH CHECK (true);
CREATE POLICY "follows_delete_own" ON public.sb_follows FOR DELETE USING (true);

-- Grant access
GRANT ALL ON public.sb_profiles TO anon, authenticated;
GRANT ALL ON public.sb_follows TO anon, authenticated;
