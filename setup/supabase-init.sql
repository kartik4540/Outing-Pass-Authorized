-- This script sets up the required tables for the SRM MAC LAB Slot Booking System
-- Run this in your Supabase SQL editor to initialize your database

-- Create lab_bookings table for storing booking information
CREATE TABLE IF NOT EXISTS lab_bookings (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  lab TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  register_number TEXT NOT NULL,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  admin_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (date, lab, time_slot)
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS lab_bookings_date_idx ON lab_bookings(date);
CREATE INDEX IF NOT EXISTS lab_bookings_email_idx ON lab_bookings(email);
CREATE INDEX IF NOT EXISTS lab_bookings_status_idx ON lab_bookings(status);

-- Create admins table for storing admin users
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create day_orders table for mapping dates to day orders
CREATE TABLE IF NOT EXISTS day_orders (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  day_order TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create health_check table for API health checks
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL PRIMARY KEY,
  status TEXT DEFAULT 'ok',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial health check record
INSERT INTO health_check (status) 
VALUES ('ok')
ON CONFLICT DO NOTHING;

-- Add Row Level Security (RLS) policies
-- Enable RLS on all tables
ALTER TABLE lab_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_check ENABLE ROW LEVEL SECURITY;

-- Creating policies for lab_bookings
-- 1. Users can view their own bookings
CREATE POLICY view_own_bookings ON lab_bookings
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND email = auth.email());

-- 2. Users can create bookings
CREATE POLICY create_bookings ON lab_bookings
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Users can delete their own bookings
CREATE POLICY delete_own_bookings ON lab_bookings
    FOR DELETE
    USING (auth.uid() IS NOT NULL AND email = auth.email());

-- 4. Admin policy helper function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  DECLARE
    is_admin BOOLEAN;
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM admins 
      WHERE email = auth.email()
    ) INTO is_admin;
    RETURN is_admin;
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Admins can view all bookings
CREATE POLICY admin_view_all_bookings ON lab_bookings
    FOR SELECT
    USING (is_admin());

-- 6. Admins can update any booking
CREATE POLICY admin_update_bookings ON lab_bookings
    FOR UPDATE
    USING (is_admin());

-- Creating policies for admins table
-- 1. Admins can view admin table
CREATE POLICY view_admins ON admins
    FOR SELECT
    USING (is_admin());

-- 2. Only super admin can modify admin table (implement in application logic)

-- Creating policies for day_orders
-- 1. Anyone can view day orders
CREATE POLICY view_day_orders ON day_orders
    FOR SELECT
    USING (true);

-- 2. Only admins can create or modify day orders
CREATE POLICY modify_day_orders ON day_orders
    FOR ALL
    USING (is_admin());

-- Creating policies for health_check
-- Public access to health_check for service checks
CREATE POLICY public_health_check ON health_check
    FOR SELECT
    USING (true);

-- Add your initial admin user (replace with your email)
-- INSERT INTO admins (email, name) VALUES ('your.admin@srmist.edu.in', 'Admin User');

COMMIT; 