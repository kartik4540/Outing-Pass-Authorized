# Database Migration: Adding Room Number Field

This document explains the database changes needed to support the new room number field in the outing requests.

## Changes Made

### 1. Database Schema Updates

#### For Existing Databases (Migration)
Run the migration script: `setup/add-room-number-migration.sql`

This script will:
- Add `room_number TEXT` column to the `outing_requests` table
- Create an index on the `room_number` column for better performance
- Add documentation comments

#### For New Deployments
The main schema file `setup/supabase-init.sql` has been updated to include the `room_number` field in the `outing_requests` table definition.

### 2. Application Updates

#### Frontend Changes (SlotBooking.js)
- Added `roomNumber` field to the form state
- Added room number input field below hostel name
- Updated form validation to require room number
- Updated booking data object to include room number

#### API Changes (api.js)
- Updated `bookSlot` function to include `room_number` in database insert
- Updated validation to require room number field
- Updated error messages to mention room number

## Migration Steps

### Step 1: Run Database Migration
1. Connect to your Supabase database
2. Execute the migration script:
   ```sql
   -- Run the contents of setup/add-room-number-migration.sql
   ALTER TABLE outing_requests ADD COLUMN IF NOT EXISTS room_number TEXT;
   COMMENT ON COLUMN outing_requests.room_number IS 'Student room number for outing requests';
   CREATE INDEX IF NOT EXISTS outing_requests_room_number_idx ON outing_requests(room_number);
   ```

### Step 2: Deploy Application Updates
1. Deploy the updated frontend code
2. The new room number field will be available in the booking form

### Step 3: Verify Migration
1. Check that the `room_number` column exists in the `outing_requests` table
2. Test creating a new booking with room number
3. Verify that existing bookings still work (room number will be NULL for old records)

## Backward Compatibility

- Existing bookings without room numbers will continue to work
- The `room_number` field is optional in the database (allows NULL)
- The frontend validation ensures new bookings include room numbers

## Rollback Plan

If you need to rollback:
1. Remove the `room_number` column: `ALTER TABLE outing_requests DROP COLUMN room_number;`
2. Revert the frontend code changes
3. Revert the API changes

## Notes

- The migration uses `ADD COLUMN IF NOT EXISTS` to prevent errors if run multiple times
- The index creation uses `IF NOT EXISTS` for the same reason
- All existing functionality remains intact 