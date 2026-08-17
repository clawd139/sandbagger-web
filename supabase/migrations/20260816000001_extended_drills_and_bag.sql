-- Extended drill schema: metrics, on-course drills, practice sessions
-- Also adds sb_bag_clubs for the "Build Your Bag" feature
-- Migration: 20260816000001

BEGIN;

-- =============================================================================
-- TABLE: sb_bag_clubs (user's bag — which clubs they carry)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sb_bag_clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES sb_profiles(id) ON DELETE CASCADE,
  club_type text NOT NULL,  -- 'driver', '3w', '5w', '7w', 'hybrid', '2i'...'9i', 'pw', 'gw', 'sw', 'lw', 'putter'
  club_name text,            -- user's custom name e.g. "TaylorMade Stealth 2"
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bag_clubs_user ON sb_bag_clubs(user_id);

ALTER TABLE sb_bag_clubs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own bag clubs" ON sb_bag_clubs;
CREATE POLICY "Users manage own bag clubs" ON sb_bag_clubs
  FOR ALL USING (true);  -- permissive RLS (no Supabase Auth, custom auth)

-- =============================================================================
-- EXTEND sb_drills: add metric_type, is_shared, practice_type
-- =============================================================================
ALTER TABLE sb_drills ADD COLUMN IF NOT EXISTS metric_type text;  -- 'success_attempts', 'streak', 'avg_distance', 'score_to_par', 'count', NULL
ALTER TABLE sb_drills ADD COLUMN IF NOT EXISTS is_shared boolean DEFAULT true;  -- shared to database = visible to all users
ALTER TABLE sb_drills ADD COLUMN IF NOT EXISTS practice_type text DEFAULT 'practice' CHECK (practice_type IN ('practice', 'on_course'));
ALTER TABLE sb_drills ADD COLUMN IF NOT EXISTS category text;  -- already exists but ensure

-- Make is_shared drills visible to all users
DROP POLICY IF EXISTS "Users see own and default drills" ON sb_drills;
DROP POLICY IF EXISTS "Users insert own drills" ON sb_drills;
DROP POLICY IF EXISTS "Users update own drills" ON sb_drills;
DROP POLICY IF EXISTS "Users delete own drills" ON sb_drills;
CREATE POLICY "Users see shared and own drills" ON sb_drills
  FOR SELECT USING (is_shared = true OR user_id::text = current_setting('request.jwt.claim.sub', true));
CREATE POLICY "Users insert drills" ON sb_drills
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Users update own drills" ON sb_drills
  FOR UPDATE USING (true);
CREATE POLICY "Users delete own drills" ON sb_drills
  FOR DELETE USING (true);

-- =============================================================================
-- EXTEND sb_drill_rounds: add practice_type, course/tee link, duration, category
-- =============================================================================
ALTER TABLE sb_drill_rounds ADD COLUMN IF NOT EXISTS practice_type text DEFAULT 'practice' CHECK (practice_type IN ('practice', 'on_course'));
ALTER TABLE sb_drill_rounds ADD COLUMN IF NOT EXISTS course_id uuid;
ALTER TABLE sb_drill_rounds ADD COLUMN IF NOT EXISTS tee_set_id uuid;
ALTER TABLE sb_drill_rounds ADD COLUMN IF NOT EXISTS duration_minutes int;
ALTER TABLE sb_drill_rounds ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE sb_drill_rounds ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE sb_drill_rounds ADD COLUMN IF NOT EXISTS date_played date DEFAULT CURRENT_DATE;
ALTER TABLE sb_drill_rounds ADD COLUMN IF NOT EXISTS metrics jsonb;  -- {metric_name: value}

ALTER TABLE sb_drill_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own drill rounds" ON sb_drill_rounds;
CREATE POLICY "Users manage own drill rounds" ON sb_drill_rounds
  FOR ALL USING (true);

-- =============================================================================
-- EXTEND sb_drill_logs: add result, miss_detail, success flag (for on-course)
-- =============================================================================
ALTER TABLE sb_drill_logs ADD COLUMN IF NOT EXISTS result text;        -- 'success', 'failed', 'partial'
ALTER TABLE sb_drill_logs ADD COLUMN IF NOT EXISTS miss_detail text;    -- 'long', 'short', 'left', 'right', 'long_left', etc
ALTER TABLE sb_drill_logs ADD COLUMN IF NOT EXISTS target_hit text;     -- 'on_target', 'slightly_off', 'missed'
ALTER TABLE sb_drill_logs ADD COLUMN IF NOT EXISTS hole_number int;
ALTER TABLE sb_drill_logs ADD COLUMN IF NOT EXISTS metric_value numeric;
ALTER TABLE sb_drill_logs ADD COLUMN IF NOT EXISTS metric_name text;

ALTER TABLE sb_drill_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own drill logs" ON sb_drill_logs;
CREATE POLICY "Users manage own drill logs" ON sb_drill_logs
  FOR ALL USING (true);

COMMIT;
