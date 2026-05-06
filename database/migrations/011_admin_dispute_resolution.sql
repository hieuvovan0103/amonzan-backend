ALTER TABLE disputes
ADD COLUMN IF NOT EXISTS decision VARCHAR(50),
ADD COLUMN IF NOT EXISTS admin_note TEXT,
ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS resolved_damage_fee DECIMAL(14, 2),
ADD COLUMN IF NOT EXISTS resolved_late_fee DECIMAL(14, 2),
ADD COLUMN IF NOT EXISTS evidence_request_target VARCHAR(20),
ADD COLUMN IF NOT EXISTS evidence_request_message TEXT,
ADD COLUMN IF NOT EXISTS evidence_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE disputes
DROP CONSTRAINT IF EXISTS disputes_status_check;

ALTER TABLE disputes
ADD CONSTRAINT disputes_status_check CHECK (
  status IN ('OPEN', 'UNDER_REVIEW', 'NEED_MORE_EVIDENCE', 'RESOLVED', 'REJECTED')
);

ALTER TABLE disputes
DROP CONSTRAINT IF EXISTS disputes_decision_check;

ALTER TABLE disputes
ADD CONSTRAINT disputes_decision_check CHECK (
  decision IS NULL OR decision IN (
    'FULL_REFUND',
    'PARTIAL_REFUND',
    'NO_REFUND',
    'RELEASE_TO_VENDOR',
    'DEDUCT_DEPOSIT',
    'REFUND_DEPOSIT',
    'SPLIT_AMOUNT'
  )
);

ALTER TABLE disputes
DROP CONSTRAINT IF EXISTS disputes_evidence_request_target_check;

ALTER TABLE disputes
ADD CONSTRAINT disputes_evidence_request_target_check CHECK (
  evidence_request_target IS NULL OR evidence_request_target IN ('RENTER', 'VENDOR', 'BOTH')
);

CREATE TABLE IF NOT EXISTS dispute_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(dispute_id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES user_profiles(user_id),
  event_type VARCHAR(50) NOT NULL,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE refund_transactions
ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES disputes(dispute_id),
ADD COLUMN IF NOT EXISTS created_by_admin_id UUID REFERENCES admin_profiles(admin_id);

ALTER TABLE escrow_transactions
ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES disputes(dispute_id);

CREATE INDEX IF NOT EXISTS idx_disputes_status_opened
ON disputes(status, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute_created
ON dispute_events(dispute_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refund_transactions_dispute
ON refund_transactions(dispute_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dispute_events TO service_role;
GRANT SELECT, INSERT ON TABLE dispute_events TO authenticated;
