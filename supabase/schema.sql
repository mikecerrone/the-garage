-- The Garage - Database Schema
-- Run this in your Supabase SQL editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types (enums)
CREATE TYPE workout_type AS ENUM ('pull', 'push', 'legs', 'other');
CREATE TYPE session_status AS ENUM ('booked', 'confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE created_via AS ENUM ('sms', 'web', 'admin');
CREATE TYPE waitlist_status AS ENUM ('waiting', 'offered', 'claimed', 'expired');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

-- Members table
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT
);

-- Availability table (Bob's schedule)
CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_recurring BOOLEAN DEFAULT TRUE,
  specific_date DATE, -- For one-off overrides
  is_blocked BOOLEAN DEFAULT FALSE, -- For blocking specific slots
  max_capacity INTEGER DEFAULT 999, -- 999 = no limit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

-- Sessions table (bookings)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  workout_type workout_type NOT NULL,
  status session_status DEFAULT 'booked',
  attended BOOLEAN DEFAULT FALSE,
  created_via created_via NOT NULL,
  notes TEXT,
  operator_request_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Waitlist table
CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  workout_type workout_type NOT NULL,
  status waitlist_status DEFAULT 'waiting',
  offered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table (billing tracking)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SMS Conversations table (for context)
CREATE TABLE sms_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  direction message_direction NOT NULL,
  message TEXT NOT NULL,
  parsed_intent JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Announcements table
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_sessions_date ON sessions(date);
CREATE INDEX idx_sessions_member_id ON sessions(member_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE UNIQUE INDEX idx_sessions_operator_request_key ON sessions(operator_request_key)
  WHERE operator_request_key IS NOT NULL;
CREATE UNIQUE INDEX idx_sessions_member_slot_active ON sessions(member_id, date, start_time)
  WHERE status <> 'cancelled';
CREATE INDEX idx_availability_day ON availability(day_of_week);
CREATE INDEX idx_availability_date ON availability(specific_date);
CREATE INDEX idx_members_phone ON members(phone);
CREATE INDEX idx_sms_conversations_phone ON sms_conversations(phone);
CREATE INDEX idx_sms_conversations_created ON sms_conversations(created_at);
CREATE INDEX idx_waitlist_date ON waitlist(date);
CREATE INDEX idx_payments_member ON payments(member_id);

-- Row Level Security Policies
-- For now, we'll use a simple admin-only model where Bob is authenticated

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users (Bob)
-- In production, you'd want more granular policies

CREATE POLICY "Allow all for authenticated" ON members
  FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated" ON availability
  FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated" ON sessions
  FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated" ON waitlist
  FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated" ON payments
  FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated" ON sms_conversations
  FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated" ON announcements
  FOR ALL USING (true);

-- Insert default availability (split schedule: 6am-12pm and 4pm-8pm, Mon-Fri)
-- Plus Saturday mornings

INSERT INTO availability (day_of_week, start_time, end_time, max_capacity) VALUES
  (1, '07:00', '09:00', 999), -- Monday morning
  (1, '18:00', '20:00', 999), -- Monday evening
  (2, '07:00', '09:00', 999), -- Tuesday morning
  (2, '18:00', '20:00', 999), -- Tuesday evening
  (3, '07:00', '09:00', 999), -- Wednesday morning
  (3, '18:00', '20:00', 999), -- Wednesday evening
  (4, '07:00', '09:00', 999), -- Thursday morning
  (4, '18:00', '20:00', 999), -- Thursday evening
  (5, '07:00', '09:00', 999), -- Friday morning
  (5, '18:00', '20:00', 999), -- Friday evening
  (6, '07:00', '09:00', 999); -- Saturday morning

-- Function to get available slots for a given date
CREATE OR REPLACE FUNCTION get_available_slots(target_date DATE)
RETURNS TABLE (
  slot_start TIME,
  slot_end TIME,
  available_spots INTEGER,
  max_capacity INTEGER
) AS $$
DECLARE
  day_num INTEGER;
BEGIN
  day_num := EXTRACT(DOW FROM target_date);

  RETURN QUERY
  WITH hourly_slots AS (
    SELECT
      (start_time + (n || ' hours')::INTERVAL)::TIME as slot_start,
      (start_time + ((n + 1) || ' hours')::INTERVAL)::TIME as slot_end,
      a.max_capacity
    FROM availability a,
    generate_series(0, EXTRACT(HOUR FROM (end_time - start_time))::INTEGER - 1) as n
    WHERE (a.day_of_week = day_num AND a.is_recurring = TRUE AND a.specific_date IS NULL)
       OR (a.specific_date = target_date AND a.is_blocked = FALSE)
  ),
  booked_counts AS (
    SELECT s.start_time, COUNT(*) as booked
    FROM sessions s
    WHERE s.date = target_date AND s.status NOT IN ('cancelled')
    GROUP BY s.start_time
  )
  SELECT
    hs.slot_start,
    hs.slot_end,
    (hs.max_capacity - COALESCE(bc.booked, 0))::INTEGER as available_spots,
    hs.max_capacity
  FROM hourly_slots hs
  LEFT JOIN booked_counts bc ON hs.slot_start = bc.start_time
  WHERE hs.max_capacity - COALESCE(bc.booked, 0) > 0
  ORDER BY hs.slot_start;
END;
$$ LANGUAGE plpgsql;
