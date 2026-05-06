ALTER TABLE pickup_return_records
ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS return_request_note TEXT,
ADD COLUMN IF NOT EXISTS return_condition_status "ConditionStatus",
ADD COLUMN IF NOT EXISTS return_evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS vendor_return_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS vendor_return_note TEXT,
ADD COLUMN IF NOT EXISTS return_issue_reason TEXT,
ADD COLUMN IF NOT EXISTS return_issue_description TEXT,
ADD COLUMN IF NOT EXISTS return_issue_evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE pickup_return_records
DROP CONSTRAINT IF EXISTS pickup_return_vendor_status_check;

ALTER TABLE pickup_return_records
ADD CONSTRAINT pickup_return_vendor_status_check CHECK (
  vendor_return_status IN ('PENDING', 'CONFIRMED', 'ISSUE_REPORTED')
);

ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES user_profiles(user_id),
ADD COLUMN IF NOT EXISTS complaint_type VARCHAR(50) NOT NULL DEFAULT 'RETURN_RESULT',
ADD COLUMN IF NOT EXISTS evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES disputes(dispute_id);

ALTER TABLE disputes
ADD COLUMN IF NOT EXISTS dispute_type VARCHAR(50) NOT NULL DEFAULT 'RETURN_DISPUTE',
ADD COLUMN IF NOT EXISTS evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pickup_return_vendor_status
ON pickup_return_records(vendor_return_status);

CREATE INDEX IF NOT EXISTS idx_complaints_type_status
ON complaints(complaint_type, status);

CREATE INDEX IF NOT EXISTS idx_disputes_type_status
ON disputes(dispute_type, status);
