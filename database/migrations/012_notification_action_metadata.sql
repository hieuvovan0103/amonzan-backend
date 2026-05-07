ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS action_url TEXT,
ADD COLUMN IF NOT EXISTS related_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS related_id UUID;

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
ON notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_related
ON notifications(related_type, related_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notifications TO service_role;
GRANT SELECT, UPDATE ON TABLE notifications TO authenticated;
