ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS action_url TEXT,
ADD COLUMN IF NOT EXISTS related_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS related_id UUID;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETURN_REQUEST_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETURN_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETURN_REPORTED_ISSUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETURN_COMPLAINT_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_NEED_MORE_EVIDENCE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ORDER_PAID';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ORDER_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ORDER_CANCELLED';

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications(user_id, is_read)
WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_type_created
ON notifications(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_related
ON notifications(related_type, related_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notifications TO service_role;
GRANT SELECT, UPDATE ON TABLE notifications TO authenticated;
