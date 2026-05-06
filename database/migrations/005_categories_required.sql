-- =============================================
-- AMONZAN DATABASE MIGRATION 005
-- Category management and required product category
-- =============================================

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

INSERT INTO categories (name, slug, description, is_active)
VALUES ('Trang phục', 'trang-phuc', 'Danh mục mặc định cho sản phẩm cũ.', TRUE)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = TRUE,
  updated_at = NOW();

UPDATE products
SET category_id = (
  SELECT category_id
  FROM categories
  WHERE slug = 'trang-phuc'
  LIMIT 1
)
WHERE category_id IS NULL;

ALTER TABLE products
ALTER COLUMN category_id SET NOT NULL;
