-- Early return requests are tracked separately to avoid expanding OrderStatus enum.

CREATE TABLE IF NOT EXISTS early_return_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES rental_orders(order_id) ON DELETE CASCADE,
  renter_profile_id UUID NOT NULL REFERENCES renter_profiles(renter_profile_id),
  requested_return_at TIMESTAMPTZ NOT NULL,
  original_rental_end TIMESTAMPTZ NOT NULL,
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  vendor_response_note TEXT,
  estimated_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  condition_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  return_condition_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT early_return_status_check CHECK (
    status IN ('PENDING', 'APPROVED', 'REJECTED', 'RECEIVED')
  ),
  CONSTRAINT early_return_requested_before_original_end CHECK (
    requested_return_at < original_rental_end
  )
);

ALTER TABLE early_return_requests
ADD COLUMN IF NOT EXISTS condition_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_early_return_pending_order
ON early_return_requests(order_id)
WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_early_return_order
ON early_return_requests(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_early_return_status
ON early_return_requests(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE early_return_requests TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE early_return_requests TO authenticated;
