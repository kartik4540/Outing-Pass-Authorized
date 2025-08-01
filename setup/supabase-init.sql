-- Admins table (for superadmin, warden, etc.)
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  password TEXT,
  role TEXT NOT NULL, -- 'superadmin', 'warden', etc.
  hostels TEXT[] NOT NULL,     -- array of hostel names for warden
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  is_active boolean DEFAULT true
);

-- Indexes for ban_students
CREATE INDEX IF NOT EXISTS ban_students_email_idx ON ban_students(student_email);
CREATE INDEX IF NOT EXISTS ban_students_active_idx ON ban_students(is_active);
CREATE INDEX IF NOT EXISTS ban_students_date_range_idx ON ban_students(from_date, till_date);

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
  actual_in_date DATE, -- NEW: Actual return date when student returns early
  actual_in_time TEXT, -- NEW: Actual return time when student returns early
  parent_email TEXT NOT NULL,
  parent_phone TEXT,
  status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'confirmed', 'rejected'
  reason TEXT,
  rejection_reason TEXT,
  otp TEXT UNIQUE,
  handled_by TEXT,
  handled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  otp_used BOOLEAN DEFAULT FALSE
);

-- Indexes for outing_requests
CREATE INDEX IF NOT EXISTS outing_requests_email_idx ON outing_requests(email);
CREATE INDEX IF NOT EXISTS outing_requests_status_idx ON outing_requests(status);
CREATE INDEX IF NOT EXISTS outing_requests_otp_idx ON outing_requests(otp);

-- Health check table (optional)
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL PRIMARY KEY,
  status TEXT DEFAULT 'ok',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial health check record
INSERT INTO health_check (status) 
VALUES ('ok')
ON CONFLICT DO NOTHING;

-- System Users Table (for custom logins)
CREATE TABLE IF NOT EXISTS system_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL,
  hostels TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE outing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies (examples, adjust as needed)
-- 1. Admins can view all admins
CREATE POLICY view_admins ON admins
    FOR SELECT
    USING (true);

-- 2. Wardens and superadmins can view all outing requests
CREATE POLICY view_outing_requests ON outing_requests
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM admins
      WHERE admins.email = auth.email()
        AND (admins.role = 'admin' OR admins.role = 'warden' OR admins.role = 'superadmin')
    ));

-- 3. Students can view their own outing requests
CREATE POLICY student_view_own_requests ON outing_requests
    FOR SELECT
    USING (email = auth.email());

-- 4. Students can insert their own outing requests
CREATE POLICY student_create_requests ON outing_requests
    FOR INSERT
    WITH CHECK (email = auth.email());

-- 5. Admins/wardens can update all outing requests
CREATE POLICY admin_update_requests ON outing_requests
    FOR UPDATE
    USING (EXISTS (
      SELECT 1 FROM admins
      WHERE admins.email = auth.email()
        AND (admins.role = 'admin' OR admins.role = 'warden' OR admins.role = 'superadmin')
    ));

-- 6. Admins/wardens can delete outing requests (optional)
CREATE POLICY admin_delete_requests ON outing_requests
    FOR DELETE
    USING (EXISTS (
      SELECT 1 FROM admins
      WHERE admins.email = auth.email()
        AND (admins.role = 'admin' OR admins.role = 'warden' OR admins.role = 'superadmin')
    ));

-- 7. Students can delete their own outing requests (optional)
CREATE POLICY student_delete_own_requests ON outing_requests
    FOR DELETE
    USING (email = auth.email());

-- 8. System users can view outing requests with "waiting" status
-- 8. System users can view all outing requests
CREATE POLICY system_user_view_all_requests ON outing_requests
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

-- 9. System users can update outing requests with "waiting" status
-- 9. System users can update all outing requests
CREATE POLICY system_user_update_all_requests ON outing_requests
    FOR UPDATE
    USING (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

-- 10. System users can insert new outing requests
CREATE POLICY system_user_insert_requests ON outing_requests
    FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

-- 11. System users can delete outing requests
CREATE POLICY system_user_delete_requests ON outing_requests
    FOR DELETE
    USING (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

-- 12. Admins/wardens can view all student info
CREATE POLICY admin_view_student_info ON student_info
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM admins
      WHERE admins.email = auth.email()
        AND (admins.role = 'admin' OR admins.role = 'warden' OR admins.role = 'superadmin')
    ));

-- 13. Admins/wardens can modify all student info
CREATE POLICY admin_modify_student_info ON student_info
    FOR ALL
    USING (EXISTS (
      SELECT 1 FROM admins
      WHERE admins.email = auth.email()
        AND (admins.role = 'admin' OR admins.role = 'warden' OR admins.role = 'superadmin')
    ));

-- 14. Students can view their own info
CREATE POLICY student_view_own_info ON student_info
    FOR SELECT
    USING (student_email = auth.email());

-- 15. Students can update their own info (optional)
CREATE POLICY student_update_own_info ON student_info
    FOR UPDATE
    USING (student_email = auth.email());

-- 16. System users: allow login by username
CREATE POLICY allow_login_by_username ON system_users
    FOR SELECT
    USING (true);

-- 17. Only admins can manage system_users (optional, adjust as needed)
-- CREATE POLICY admin_manage_system_users ON system_users
--     FOR ALL
--     USING (auth.role() = 'authenticated' AND auth.email() = 'your-admin-email@example.com');

-- 18. Enable RLS for ban_students table
ALTER TABLE ban_students ENABLE ROW LEVEL SECURITY;

-- 19. Admins can view all bans
CREATE POLICY view_ban_students ON ban_students
    FOR SELECT
    USING (true);

-- 20. Only admins can create/update/delete bans
CREATE POLICY modify_ban_students ON ban_students
    FOR ALL
    USING (true);

-- 21. Students can view their own ban status
CREATE POLICY student_view_own_ban ON ban_students
    FOR SELECT
    USING (student_email = auth.email());

-- 22. System users can view all ban records
CREATE POLICY system_user_view_ban_students ON ban_students
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

-- 23. System users can view student info
CREATE POLICY system_user_view_student_info ON student_info
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM system_users
      WHERE system_users.username = auth.jwt() ->> 'username'
        OR system_users.email = auth.email()
    ));

COMMIT;