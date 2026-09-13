-- =====================================================
-- TABLE CREATION FOR OUTING PASS SYSTEM
-- Run this BEFORE COMPLETE_SCHEMA.sql.
-- COMPLETE_SCHEMA.sql only creates functions/policies/indexes
-- and assumes these tables already exist.
-- Safe to re-run: uses IF NOT EXISTS throughout.
-- =====================================================

-- =====================================================
-- admins: super admins / admins (role-based, authenticated via Supabase Auth)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.admins (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
  hostels text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- wardens: hostel wardens, mapped to Supabase Auth accounts by email
-- =====================================================
CREATE TABLE IF NOT EXISTS public.wardens (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  hostels text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- arch_gate: arch gate / OTP verification staff, mapped to Supabase Auth accounts
-- =====================================================
CREATE TABLE IF NOT EXISTS public.arch_gate (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- student_info: directory of students, keyed by student_email
-- =====================================================
CREATE TABLE IF NOT EXISTS public.student_info (
  id serial PRIMARY KEY,
  student_email text NOT NULL UNIQUE,
  hostel_name text,
  parent_email text,
  parent_phone text,
  updated_by text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- outing_requests: core booking table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.outing_requests (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  hostel_name text NOT NULL,
  room_number text NOT NULL,
  out_date date NOT NULL,
  out_time time NOT NULL,
  in_date date NOT NULL,
  in_time time NOT NULL,
  parent_email text,
  parent_phone text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'still_out', 'confirmed', 'rejected')),

  -- Handler tracking (approve/reject)
  handled_by text,
  handled_at timestamptz,
  rejection_reason text,

  -- OTP verification at arch gate
  otp text,
  otp_used boolean,
  otp_verified_by text,
  otp_verified_at timestamptz,

  -- Return-time extension tracking
  extension_count integer NOT NULL DEFAULT 0,
  extension_reason text,
  extended_by text,
  extended_at timestamptz,
  original_in_date date,
  original_in_time time,

  -- Set when the student actually checks back in (not currently written by the app)
  actual_in_time timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- ban_students: banned students, per date range
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ban_students (
  id serial PRIMARY KEY,
  student_email text NOT NULL,
  from_date date NOT NULL,
  till_date date NOT NULL,
  reason text,
  banned_by text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- health_check: trivial table used by the frontend to test connectivity
-- =====================================================
CREATE TABLE IF NOT EXISTS public.health_check (
  id serial PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables (COMPLETE_SCHEMA.sql adds the actual policies)
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wardens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arch_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ban_students ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- NEXT STEP: run supabase/COMPLETE_SCHEMA.sql to add
-- helper functions, indexes, and RLS policies.
-- =====================================================
