-- =====================================================
-- SQL QUERIES TO CHECK TIMESTAMP FORMATS
-- =====================================================

-- 1. Check the current data format in outing_requests table
-- This will show us how handled_at timestamps are currently stored
SELECT 
    id,
    name,
    email,
    status,
    handled_at,
    created_at,
    -- Check if handled_at is in the expected format (YYYY-MM-DD HH:MM)
    CASE 
        WHEN handled_at IS NOT NULL THEN 
            CASE 
                WHEN handled_at::text ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}' THEN 'Correct Format (YYYY-MM-DD HH:MM)'
                ELSE 'Different Format: ' || handled_at::text
            END
        ELSE 'NULL'
    END as format_check
FROM outing_requests 
WHERE handled_at IS NOT NULL
ORDER BY handled_at DESC
LIMIT 10;

-- 2. Check the current data format in ban_students table
-- This will show us how updated_at timestamps are currently stored
SELECT 
    id,
    student_email,
    from_date,
    till_date,
    updated_at,
    created_at,
    -- Check if updated_at is in the expected format
    CASE 
        WHEN updated_at IS NOT NULL THEN 
            CASE 
                WHEN updated_at::text ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}' THEN 'Correct Format (YYYY-MM-DD HH:MM)'
                ELSE 'Different Format: ' || updated_at::text
            END
        ELSE 'NULL'
    END as format_check
FROM ban_students 
WHERE updated_at IS NOT NULL
ORDER BY updated_at DESC
LIMIT 10;

-- 3. Test query to see what the new Indian time format would look like
-- This simulates what our JavaScript code is now generating
SELECT 
    'Current UTC Time' as time_type,
    NOW() as current_time,
    NOW()::text as current_time_text
UNION ALL
SELECT 
    'Indian Time (Simulated)' as time_type,
    NOW() AT TIME ZONE 'Asia/Kolkata' as indian_time,
    (NOW() AT TIME ZONE 'Asia/Kolkata')::text as indian_time_text
UNION ALL
SELECT 
    'Expected Format (YYYY-MM-DD HH:MM)' as time_type,
    NOW() AT TIME ZONE 'Asia/Kolkata' as expected_time,
    TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as expected_format;

-- 4. Check if there are any recent entries to verify the new format
-- Look for entries created in the last 24 hours
SELECT 
    'Recent Outing Requests' as table_name,
    COUNT(*) as total_entries,
    COUNT(handled_at) as entries_with_handled_at,
    MIN(handled_at) as earliest_handled_at,
    MAX(handled_at) as latest_handled_at
FROM outing_requests 
WHERE created_at >= NOW() - INTERVAL '24 hours'
UNION ALL
SELECT 
    'Recent Ban Entries' as table_name,
    COUNT(*) as total_entries,
    COUNT(updated_at) as entries_with_updated_at,
    MIN(updated_at) as earliest_updated_at,
    MAX(updated_at) as latest_updated_at
FROM ban_students 
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- 5. Detailed format analysis for recent entries
SELECT 
    'outing_requests' as table_name,
    id,
    handled_at,
    LENGTH(handled_at::text) as text_length,
    SUBSTRING(handled_at::text, 1, 16) as first_16_chars,
    CASE 
        WHEN handled_at::text ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}' THEN '✅ Correct Format'
        WHEN handled_at::text ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN '⚠️ ISO Format (T separator)'
        WHEN handled_at::text ~ '^\d{4}-\d{2}-\d{2},\d{2}:\d{2}' THEN '⚠️ Comma Format'
        ELSE '❌ Unexpected Format: ' || handled_at::text
    END as format_status
FROM outing_requests 
WHERE handled_at IS NOT NULL 
    AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY handled_at DESC
LIMIT 5;

-- 6. Test insertion to verify the new format works
-- (This is a safe test that won't affect existing data)
SELECT 
    'Test Insertion Format' as test_type,
    TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as new_indian_format,
    'Expected: YYYY-MM-DD HH:MM format' as expected_result;

-- 7. Check timezone information in existing data
SELECT 
    'Timezone Analysis' as analysis_type,
    handled_at,
    handled_at::timestamp with time zone AT TIME ZONE 'UTC' as utc_time,
    handled_at::timestamp with time zone AT TIME ZONE 'Asia/Kolkata' as ist_time,
    'No timezone info (stored as text)' as timezone_note
FROM outing_requests 
WHERE handled_at IS NOT NULL
ORDER BY handled_at DESC
LIMIT 3;

-- 8. Simple format check (works with any timestamp type)
SELECT 
    'Simple Format Check' as check_type,
    handled_at,
    CASE 
        WHEN handled_at IS NULL THEN 'NULL'
        WHEN handled_at::text ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}' THEN '✅ YYYY-MM-DD HH:MM format'
        WHEN handled_at::text ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN '⚠️ ISO format with T'
        WHEN handled_at::text ~ '^\d{4}-\d{2}-\d{2},\d{2}:\d{2}' THEN '⚠️ Format with comma'
        ELSE '❌ Other format: ' || SUBSTRING(handled_at::text, 1, 20)
    END as format_status
FROM outing_requests 
WHERE handled_at IS NOT NULL
ORDER BY handled_at DESC
LIMIT 5;

-- 9. Test current Indian time format (safe query)
SELECT 
    'Current Indian Time Test' as test_type,
    TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as indian_format,
    'This is what your JS code should generate' as note;
