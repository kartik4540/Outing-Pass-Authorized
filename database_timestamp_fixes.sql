-- =====================================================
-- DATABASE MIGRATION: Fix Timestamp Columns for Indian Time
-- =====================================================

-- 1. First, backup existing data (optional but recommended)
-- CREATE TABLE outing_requests_backup AS SELECT * FROM outing_requests;
-- CREATE TABLE ban_students_backup AS SELECT * FROM ban_students;

-- 2. Update outing_requests.handled_at column
-- Convert from TEXT to TIMESTAMP WITH TIME ZONE
ALTER TABLE outing_requests 
ALTER COLUMN handled_at TYPE TIMESTAMP WITH TIME ZONE 
USING handled_at::TIMESTAMP WITH TIME ZONE;

-- 3. Update ban_students.updated_at column  
ALTER TABLE ban_students 
ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE 
USING updated_at::TIMESTAMP WITH TIME ZONE;

-- 4. Add comments to document the changes
COMMENT ON COLUMN outing_requests.handled_at IS 'Stores Indian Standard Time (IST) when request was handled';
COMMENT ON COLUMN ban_students.updated_at IS 'Stores Indian Standard Time (IST) when ban was last updated';

-- 5. Verify the changes
SELECT 
    'outing_requests.handled_at' as column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'outing_requests' AND column_name = 'handled_at'
UNION ALL
SELECT 
    'ban_students.updated_at' as column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'ban_students' AND column_name = 'updated_at';
