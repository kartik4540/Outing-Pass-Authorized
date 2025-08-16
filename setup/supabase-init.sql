-- =====================================================
-- OUTING PASS MANAGEMENT SYSTEM - FINALIZED SQL SCHEMA
-- =====================================================
-- This file contains the complete database schema and security policies
-- for the Outing Pass Management System with proper role-based access control

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE DEFINITIONS
-- =====================================================

-- Admins table (for superadmin, warden, etc.)
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  password TEXT,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'warden')), -- Enforce valid roles
  hostels TEXT[] NOT NULL DEFAULT '{}',     -- array of hostel names for warden
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Student Info Table for Admin Management
CREATE TABLE IF NOT EXISTS student_info (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_email text UNIQUE NOT NULL,
  hostel_name text NOT NULL,
  parent_email text NOT NULL,
  parent_phone text NOT NULL, -- parent's phone number
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  created_by text,
  updated_by text
);

-- Ban Students Table
CREATE TABLE IF NOT EXISTS ban_students (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_email text NOT NULL,
  from_date date NOT NULL,
  till_date date NOT NULL,
  reason text,
  banned_by text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  is_active boolean DEFAULT true,
  -- Add constraint to ensure from_date <= till_date
  CONSTRAINT valid_date_range CHECK (from_date <= till_date)
);

-- Outing Requests Table
CREATE TABLE IF NOT EXISTS outing_requests (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  hostel_name TEXT NOT NULL,
  room_number TEXT,
  out_date DATE NOT NULL,
  out_time TEXT NOT NULL,
  in_date DATE NOT NULL,
  in_time TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  parent_phone TEXT,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'confirmed', 'rejected', 'still_out')),
  reason TEXT,
  rejection_reason TEXT,
  otp TEXT UNIQUE,
  handled_by TEXT,
  handled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  otp_used BOOLEAN DEFAULT FALSE,
  -- Add constraint to ensure out_date <= in_date
  CONSTRAINT valid_outing_dates CHECK (out_date <= in_date)
);

-- System Users Table (for custom logins - wardens, arch_gate, etc.)
CREATE TABLE IF NOT EXISTS system_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('warden', 'arch_gate', 'admin')),
  hostels TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Health check table (optional)
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL PRIMARY KEY,
  status TEXT DEFAULT 'ok',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Indexes for ban_students
CREATE INDEX IF NOT EXISTS ban_students_email_idx ON ban_students(student_email);
CREATE INDEX IF NOT EXISTS ban_students_active_idx ON ban_students(is_active);
CREATE INDEX IF NOT EXISTS ban_students_date_range_idx ON ban_students(from_date, till_date);
CREATE INDEX IF NOT EXISTS ban_students_banned_by_idx ON ban_students(banned_by);

-- Indexes for outing_requests
CREATE INDEX IF NOT EXISTS outing_requests_email_idx ON outing_requests(email);
CREATE INDEX IF NOT EXISTS outing_requests_status_idx ON outing_requests(status);
CREATE INDEX IF NOT EXISTS outing_requests_otp_idx ON outing_requests(otp);
CREATE INDEX IF NOT EXISTS outing_requests_hostel_idx ON outing_requests(hostel_name);
CREATE INDEX IF NOT EXISTS outing_requests_date_idx ON outing_requests(out_date);

-- Indexes for student_info
CREATE INDEX IF NOT EXISTS student_info_email_idx ON student_info(student_email);
CREATE INDEX IF NOT EXISTS student_info_hostel_idx ON student_info(hostel_name);

-- Indexes for system_users
CREATE INDEX IF NOT EXISTS system_users_username_idx ON system_users(username);
CREATE INDEX IF NOT EXISTS system_users_role_idx ON system_users(role);

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert initial health check record
INSERT INTO health_check (status) 
VALUES ('ok')
ON CONFLICT DO NOTHING;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) SETUP
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE outing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_check ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: Disable RLS for ban_students table
-- Security is handled at application level due to custom authentication
ALTER TABLE ban_students DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- =====================================================
-- ADMINS TABLE POLICIES
-- =====================================================

-- 1. Allow all authenticated users to view admins (for role checking)
CREATE POLICY view_admins ON admins
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- =====================================================
-- OUTING_REQUESTS TABLE POLICIES
-- =====================================================

-- 2. Students can view their own outing requests
CREATE POLICY student_view_own_requests ON outing_requests
    FOR SELECT
    USING (email = auth.email());

-- 3. Students can insert their own outing requests
CREATE POLICY student_create_requests ON outing_requests
    FOR INSERT
    WITH CHECK (email = auth.email());

-- 4. Students can delete their own outing requests (optional)
CREATE POLICY student_delete_own_requests ON outing_requests
    FOR DELETE
    USING (email = auth.email());

-- 5. Admins/wardens can view all outing requests (via admins table)
CREATE POLICY admin_view_outing_requests ON outing_requests
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM admins
      WHERE admins.email = auth.email()
        AND (admins.role = 'admin' OR admins.role = 'warden' OR admins.role = 'superadmin')
    ));

-- 6. Admins/wardens can update all outing requests
CREATE POLICY admin_update_outing_requests ON outing_requests
    FOR UPDATE
    USING (EXISTS (
      SELECT 1 FROM admins
      WHERE admins.email = auth.email()
        AND (admins.role = 'admin' OR admins.role = 'warden' OR admins.role = 'superadmin')
    ));

-- 7. Admins/wardens can delete outing requests
CREATE POLICY admin_delete_outing_requests ON outing_requests
    FOR DELETE
    USING (EXISTS (
      SELECT 1 FROM admins
      WHERE admins.email = auth.email()
        AND (admins.role = 'admin' OR admins.role = 'warden' OR admins.role = 'superadmin')
    ));

-- 8. System users (wardens) can view all outing requests
CREATE POLICY system_user_view_outing_requests ON outing_requests
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

-- 9. System users (wardens) can update all outing requests
CREATE POLICY system_user_update_outing_requests ON outing_requests
    FOR UPDATE
    USING (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

-- 10. System users (wardens) can insert new outing requests
CREATE POLICY system_user_insert_outing_requests ON outing_requests
    FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

-- 11. System users (wardens) can delete outing requests
CREATE POLICY system_user_delete_outing_requests ON outing_requests
    FOR DELETE
    USING (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

-- =====================================================
-- STUDENT_INFO TABLE POLICIES
-- =====================================================

-- 12. Students can view their own info
CREATE POLICY student_view_own_info ON student_info
    FOR SELECT
    USING (student_email = auth.email());

-- 13. Students can update their own info (optional)
CREATE POLICY student_update_own_info ON student_info
    FOR UPDATE
    USING (student_email = auth.email());

-- 14. Admins/wardens can view all student info
CREATE POLICY admin_view_student_info ON student_info
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM admins
      WHERE admins.email = auth.email()
        AND (admins.role = 'admin' OR admins.role = 'warden' OR admins.role = 'superadmin')
    ));

-- 15. Only super admins can modify student info
CREATE POLICY admin_modify_student_info ON student_info
    FOR ALL
    USING (EXISTS (
      SELECT 1 FROM admins
      WHERE admins.email = auth.email()
        AND admins.role = 'superadmin'
    ));

-- 16. System users (wardens) can view student info
CREATE POLICY system_user_view_student_info ON student_info
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

-- =====================================================
-- SYSTEM_USERS TABLE POLICIES
-- =====================================================

-- 17. Allow all users to view system_users (for authentication)
CREATE POLICY allow_login_by_username ON system_users
    FOR SELECT
    USING (true);

-- =====================================================
-- HEALTH_CHECK TABLE POLICIES
-- =====================================================

-- 18. Allow all authenticated users to view health check
CREATE POLICY view_health_check ON health_check
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- =====================================================
-- SECURITY COMMENTS AND DOCUMENTATION
-- =====================================================

-- Add security documentation to tables
COMMENT ON TABLE ban_students IS 'RLS disabled - security handled at application level. Only superadmins and wardens can modify bans.';
COMMENT ON TABLE system_users IS 'Custom authentication table for wardens and other system users. RLS allows all SELECT for login purposes.';
COMMENT ON TABLE admins IS 'Admin management table. RLS allows authenticated users to view for role checking.';
COMMENT ON TABLE outing_requests IS 'Student outing requests. RLS allows students to manage their own requests and admins/wardens to manage all.';
COMMENT ON TABLE student_info IS 'Student information. RLS allows students to view their own info and superadmins to modify all.';

-- =====================================================
-- FINAL COMMIT
-- =====================================================

COMMIT;