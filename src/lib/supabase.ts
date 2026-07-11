import { createClient } from "@supabase/supabase-js";

/*
 * ── Supabase Setup ──────────────────────────────────────────────────────────
 *
 * The full multi-tenant schema (organizations, profiles, app_store with org
 * isolation via RLS) lives in supabase_migration.sql at the repo root - run it
 * in the Supabase SQL Editor. Do NOT create tables by hand from memory: the
 * app relies on org_id scoping and the RLS policies defined there.
 *
 * Then fill in .env.local with the project URL and anon key
 * (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
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
