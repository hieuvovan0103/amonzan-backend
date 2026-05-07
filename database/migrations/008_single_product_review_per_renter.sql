-- Ensure each renter can have only one product review per product.
-- Existing app logic now treats later feedback as edits to the original review.

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_product_renter
ON reviews(renter_profile_id, target_type, target_id)
WHERE target_type = 'PRODUCT';
