-- Migration: Add room_number column to outing_requests table
-- This migration adds the room_number field to store student room numbers

-- Add room_number column to outing_requests table
ALTER TABLE outing_requests 
ADD COLUMN IF NOT EXISTS room_number TEXT;

-- Add comment to document the column
COMMENT ON COLUMN outing_requests.room_number IS 'Student room number for outing requests';

-- Create index for room_number for better query performance
CREATE INDEX IF NOT EXISTS outing_requests_room_number_idx ON outing_requests(room_number);

-- Update the existing schema file to include room_number in future deployments
-- Note: This migration should be run on existing databases
-- For new deployments, update the main supabase-init.sql file to include room_number in the CREATE TABLE statement 