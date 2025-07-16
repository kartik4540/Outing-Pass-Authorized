-- Admins table (for superadmin, warden, etc.)
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  password TEXT,
  role TEXT NOT NULL, -- 'superadmin', 'warden', etc.
  hostels TEXT[],     -- array of hostel names for warden
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Student Info Table for Admin Management
CREATE TABLE IF NOT EXISTS student_info (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_email text UNIQUE NOT NULL,
  hostel_name text NOT NULL,
  parent_email text NOT NULL,
  parent_phone text, -- NEW: parent's phone number
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Outing Requests Table
CREATE TABLE IF NOT EXISTS outing_requests (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  hostel_name TEXT NOT NULL,
  out_date DATE NOT NULL,
  out_time TEXT NOT NULL,
  in_date DATE NOT NULL,
  in_time TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'confirmed', 'rejected'
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

-- Enable RLS (Row Level Security)
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE outing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_check ENABLE ROW LEVEL SECURITY;

-- RLS Policies (examples, adjust as needed)
-- 1. Admins can view all admins
CREATE POLICY view_admins ON admins
    FOR SELECT
    USING (true);

-- 2. Wardens and superadmins can view all outing requests
CREATE POLICY view_outing_requests ON outing_requests
    FOR SELECT
    USING (true);

-- 3. Students can view their own outing requests
CREATE POLICY student_view_own_requests ON outing_requests
    FOR SELECT
    USING (email = auth.email());

-- 4. Students can insert their own outing requests
CREATE POLICY student_create_requests ON outing_requests
    FOR INSERT
    WITH CHECK (email = auth.email());

-- 5. Wardens/superadmins can update status, handled_by, etc.
CREATE POLICY admin_update_requests ON outing_requests
    FOR UPDATE
    USING (true);

-- 6. Anyone can view student_info (or restrict to admins/wardens)
CREATE POLICY view_student_info ON student_info
    FOR SELECT
    USING (true);

-- 7. Only admins/wardens can modify student_info
CREATE POLICY modify_student_info ON student_info
    FOR ALL
    USING (true);

COMMIT;