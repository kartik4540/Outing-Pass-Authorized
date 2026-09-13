-- Adds support for wardens extending a student's expected return time/date
-- while the student is "Still Out". Run this once in the Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS, does not touch existing columns/data.

ALTER TABLE public.outing_requests
  ADD COLUMN IF NOT EXISTS extension_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extension_reason text,
  ADD COLUMN IF NOT EXISTS extended_by text,
  ADD COLUMN IF NOT EXISTS extended_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_in_date date,
  ADD COLUMN IF NOT EXISTS original_in_time time;
  