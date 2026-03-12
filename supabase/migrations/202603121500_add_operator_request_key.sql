ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS operator_request_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_operator_request_key
ON sessions (operator_request_key)
WHERE operator_request_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_member_slot_active
ON sessions (member_id, date, start_time)
WHERE status <> 'cancelled';
