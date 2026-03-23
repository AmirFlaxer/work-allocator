import { createClient } from "@supabase/supabase-js";

/*
 * ── Supabase Setup ──────────────────────────────────────────────────────────
 *
 * Run the following SQL in your Supabase project (SQL Editor):
 *
 *   CREATE TABLE app_store (
 *     key TEXT PRIMARY KEY,
 *     value JSONB NOT NULL,
 *     updated_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 *
 *   ALTER TABLE app_store ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "Allow all" ON app_store FOR ALL USING (true) WITH CHECK (true);
 *
 * Then enable Realtime for the table:
 *   Supabase Dashboard → Database → Replication → app_store ✓
 *
 * Finally fill in .env.local with your project URL and anon key.
 * ────────────────────────────────────────────────────────────────────────────
 */

const url  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const isConfigured =
  !!url && !!key &&
  !url.includes("your-project") &&
  !key.includes("your-anon-key");

export const supabase = isConfigured ? createClient(url!, key!) : null;
export const isSupabaseConfigured = isConfigured;
