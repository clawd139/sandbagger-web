import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client (no NEXT_PUBLIC prefix — stays on server)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wznuxiysfirtcyvfrvdb.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bnV4aXlzZmlydGN5dmZydmRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5MjUzMjksImV4cCI6MjA3NjUwMTMyOX0.FR9w01MywcooK-Bv9Ly2FWN29YCgG4wDQDLTtIaNzRQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
