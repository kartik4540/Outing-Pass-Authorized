-- Add locked slots table to track permanently locked slots
CREATE TABLE IF NOT EXISTS locked_slots (
    id SERIAL PRIMARY KEY,
    lab TEXT NOT NULL,
    time_slot TEXT NOT NULL,
    day_order TEXT NOT NULL,
    locked_by TEXT NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT,
    UNIQUE(lab, time_slot, day_order)
);

-- Add RLS policies for locked_slots
ALTER TABLE locked_slots ENABLE ROW LEVEL SECURITY;

-- Only admins can view locked slots
CREATE POLICY view_locked_slots ON locked_slots
    FOR SELECT
    USING (is_admin());

-- Only admins can manage locked slots
CREATE POLICY manage_locked_slots ON locked_slots
    FOR ALL
    USING (is_admin());

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS locked_slots_lab_idx ON locked_slots(lab);
CREATE INDEX IF NOT EXISTS locked_slots_day_order_idx ON locked_slots(day_order); 