-- Official shop replies for product reviews.

CREATE TABLE IF NOT EXISTS review_replies (
  reply_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shop_profiles(shop_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT review_replies_content_not_blank CHECK (LENGTH(BTRIM(content)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_review_replies_review
ON review_replies(review_id);

CREATE INDEX IF NOT EXISTS idx_review_replies_shop
ON review_replies(shop_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE review_replies TO service_role;

