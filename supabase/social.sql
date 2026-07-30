-- Sandbagger Web App — Auth + Social tables
-- Run this in Supabase SQL Editor

-- Profiles table (one row per auth user)
CREATE TABLE IF NOT EXISTS sb_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  handicap NUMERIC,
  home_course TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Follows table (follower follows followee)
CREATE TABLE IF NOT EXISTS sb_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, followee_id)
);

-- RLS Policies

-- Profiles: anyone can read, only owner can write
ALTER TABLE sb_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all" ON sb_profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON sb_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON sb_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Follows: anyone can read (to see who follows who), only auth user can insert/delete own follows
ALTER TABLE sb_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_read_all" ON sb_follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_own" ON sb_follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows_delete_own" ON sb_follows FOR DELETE USING (auth.uid() = follower_id);

-- sb_rounds: owner can do anything, others can read public rounds
-- (Only add if RLS not already enabled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'sb_rounds' AND rowsecurity = true
  ) THEN
    ALTER TABLE sb_rounds ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "rounds_read_public" ON sb_rounds FOR SELECT USING (
      visibility = 'public' OR user_id = auth.uid()
    );
    CREATE POLICY "rounds_insert_own" ON sb_rounds FOR INSERT WITH CHECK (user_id = auth.uid());
    CREATE POLICY "rounds_update_own" ON sb_rounds FOR UPDATE USING (user_id = auth.uid());
    CREATE POLICY "rounds_delete_own" ON sb_rounds FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

-- sb_hole_scores: readable when the parent round is public or owned by user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'sb_hole_scores' AND rowsecurity = true
  ) THEN
    ALTER TABLE sb_hole_scores ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "scores_read_public" ON sb_hole_scores FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM sb_rounds
        WHERE sb_rounds.id = sb_hole_scores.round_id
        AND (sb_rounds.visibility = 'public' OR sb_rounds.user_id = auth.uid())
      )
    );
    CREATE POLICY "scores_insert_own" ON sb_hole_scores FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM sb_rounds
        WHERE sb_rounds.id = sb_hole_scores.round_id
        AND sb_rounds.user_id = auth.uid()
      )
    );
    CREATE POLICY "scores_delete_own" ON sb_hole_scores FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM sb_rounds
        WHERE sb_rounds.id = sb_hole_scores.round_id
        AND sb_rounds.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- sb_courses: public read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'sb_courses' AND rowsecurity = true
  ) THEN
    ALTER TABLE sb_courses ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "courses_read_all" ON sb_courses FOR SELECT USING (true);
  END IF;
END $$;

-- sb_tee_sets: public read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'sb_tee_sets' AND rowsecurity = true
  ) THEN
    ALTER TABLE sb_tee_sets ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "tee_sets_read_all" ON sb_tee_sets FOR SELECT USING (true);
  END IF;
END $$;

-- sb_tee_holes: public read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'sb_tee_holes' AND rowsecurity = true
  ) THEN
    ALTER TABLE sb_tee_holes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "tee_holes_read_all" ON sb_tee_holes FOR SELECT USING (true);
  END IF;
END $$;

-- sb_holes: public read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'sb_holes' AND rowsecurity = true
  ) THEN
    ALTER TABLE sb_holes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "holes_read_all" ON sb_holes FOR SELECT USING (true);
  END IF;
END $$;
