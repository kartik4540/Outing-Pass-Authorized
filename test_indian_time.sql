-- =====================================================
-- TEST: Verify Indian Time Implementation
-- =====================================================

-- Test 1: Check what format your JS code generates
SELECT 
    'JS Code Output' as test_type,
    TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as expected_format,
    'Should match: 2024-01-15 14:30' as note;

-- Test 2: Check if columns are ready for TIMESTAMP WITH TIME ZONE
SELECT 
    column_name,
    data_type,
    CASE 
        WHEN data_type = 'timestamp with time zone' THEN '✅ Ready for Indian time'
        WHEN data_type = 'timestamp without time zone' THEN '⚠️ Needs migration'
        WHEN data_type = 'text' THEN '⚠️ Needs migration'
        ELSE '❌ Unknown type: ' || data_type
    END as status
FROM information_schema.columns 
WHERE (table_name = 'outing_requests' AND column_name = 'handled_at')
   OR (table_name = 'ban_students' AND column_name = 'updated_at');

-- Test 3: Insert a test record to verify format (safe test)
INSERT INTO outing_requests (
    name, email, hostel_name, out_date, out_time, in_date, in_time, 
    parent_email, status, handled_at
) VALUES (
    'Test User', 'test@example.com', 'Test Hostel', 
    CURRENT_DATE, '10:00', CURRENT_DATE, '18:00',
    'parent@example.com', 'confirmed',
    TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')
) RETURNING id, handled_at;

-- Test 4: Verify the inserted record
SELECT 
    id,
    handled_at,
    handled_at::text as raw_format,
    CASE 
        WHEN handled_at::text ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}' THEN '✅ Correct Indian Format'
        ELSE '❌ Wrong Format: ' || handled_at::text
    END as format_check
FROM outing_requests 
WHERE name = 'Test User' AND email = 'test@example.com';

-- Test 5: Clean up test data
DELETE FROM outing_requests 
WHERE name = 'Test User' AND email = 'test@example.com';
