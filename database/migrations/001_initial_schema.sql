-- =============================================
-- AMONZAN DATABASE MIGRATION 001
-- Initial Schema
-- Generated from classdiagram.mmd
-- =============================================

-- Enable UUID extension (safe nếu đã có)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- ENUMS (10 enums)
-- =============================================

DO $$ BEGIN CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ConditionStatus" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'DAMAGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "InventoryItemStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'RENTED', 'MAINTENANCE', 'LOST', 'DAMAGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'CONFIRMED', 'READY_FOR_PICKUP', 'IN_RENTAL', 'RETURN_PENDING', 'COMPLETED', 'CANCELLED', 'LATE', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "PaymentMethodType" AS ENUM ('WALLET', 'VNPAY', 'COD_DEPOSIT', 'BANK_TRANSFER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'PACKING', 'SHIPPING', 'DELIVERED', 'RETURNING', 'RETURNED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ReviewTargetType" AS ENUM ('SHOP', 'RENTER', 'PRODUCT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "NotificationType" AS ENUM ('ORDER_CREATED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'ORDER_CANCELLED', 'RETURN_REMINDER', 'REVIEW_REMINDER', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================
-- GROUP 1: USER / ROLE (7 tables)
-- Supabase Auth chịu trách nhiệm đăng ký / đăng nhập / mật khẩu.
-- Bảng public chỉ lưu hồ sơ và phân quyền nghiệp vụ.
-- =============================================

CREATE TABLE IF NOT EXISTS roles (
  role_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id       UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name          VARCHAR(255),
  email              VARCHAR(255) UNIQUE,
  phone_number       VARCHAR(20),
  gender             VARCHAR(20),
  id_number          VARCHAR(50),
  avatar_url         TEXT,
  date_of_birth      DATE,
  is_email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  is_phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Many-to-many: user_profiles <-> roles
CREATE TABLE IF NOT EXISTS user_roles (
  user_id  UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  role_id  UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS addresses (
  address_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  recipient_name VARCHAR(255) NOT NULL,
  phone_number   VARCHAR(20) NOT NULL,
  line1          VARCHAR(500) NOT NULL,
  line2          VARCHAR(500),
  ward           VARCHAR(100),
  district       VARCHAR(100),
  city           VARCHAR(100),
  province       VARCHAR(100),
  postal_code    VARCHAR(20),
  country        VARCHAR(100) NOT NULL DEFAULT 'Vietnam',
  is_default     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS renter_profiles (
  renter_profile_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID UNIQUE NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  reputation_score    FLOAT NOT NULL DEFAULT 0,
  verification_status "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  penalty_points      DECIMAL(10, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shop_profiles (
  shop_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID UNIQUE NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  shop_name            VARCHAR(255) NOT NULL,
  description          TEXT,
  business_license_no  VARCHAR(100),
  verification_status  "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  rating_average       FLOAT NOT NULL DEFAULT 0,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS admin_profiles (
  admin_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  staff_code VARCHAR(100) UNIQUE NOT NULL
);


-- =============================================
-- GROUP 2: PRODUCT CATALOG (6 tables + 1 helper)
-- =============================================

CREATE TABLE IF NOT EXISTS categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS products (
  product_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        UUID NOT NULL REFERENCES shop_profiles(shop_id) ON DELETE CASCADE,
  category_id    UUID REFERENCES categories(category_id) ON DELETE SET NULL,
  name           VARCHAR(500) NOT NULL,
  slug           VARCHAR(500) UNIQUE NOT NULL,
  description    TEXT,
  status         "ProductStatus" NOT NULL DEFAULT 'DRAFT',
  average_rating FLOAT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_images (
  image_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS product_variants (
  variant_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id           UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  sku                  VARCHAR(255) UNIQUE NOT NULL,
  variant_name         VARCHAR(255) NOT NULL,
  base_daily_rate      DECIMAL(12, 2) NOT NULL,
  base_weekly_rate     DECIMAL(12, 2),
  deposit_requirement  DECIMAL(12, 2) NOT NULL DEFAULT 0,
  condition            "ConditionStatus" NOT NULL DEFAULT 'NEW',
  total_stock          INT NOT NULL DEFAULT 0,
  available_stock      INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory_items (
  item_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id        UUID NOT NULL REFERENCES product_variants(variant_id) ON DELETE CASCADE,
  serial_number     VARCHAR(255) UNIQUE,
  qr_code           VARCHAR(255) UNIQUE,
  status            "InventoryItemStatus" NOT NULL DEFAULT 'AVAILABLE',
  current_condition "ConditionStatus" NOT NULL DEFAULT 'NEW',
  acquired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS availability_calendars (
  calendar_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  UUID UNIQUE NOT NULL REFERENCES product_variants(variant_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Các khoảng thời gian đã bị block (từ đơn hàng hoặc bảo trì)
CREATE TABLE IF NOT EXISTS calendar_blocked_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID NOT NULL REFERENCES availability_calendars(calendar_id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      VARCHAR(255),
  CONSTRAINT valid_blocked_period CHECK (end_date >= start_date)
);


-- =============================================
-- GROUP 3: CART / WISHLIST (4 tables)
-- =============================================

CREATE TABLE IF NOT EXISTS carts (
  cart_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renter_profile_id UUID UNIQUE NOT NULL REFERENCES renter_profiles(renter_profile_id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  cart_item_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id         UUID NOT NULL REFERENCES carts(cart_id) ON DELETE CASCADE,
  variant_id      UUID NOT NULL REFERENCES product_variants(variant_id) ON DELETE CASCADE,
  rental_start    TIMESTAMPTZ NOT NULL,
  rental_end      TIMESTAMPTZ NOT NULL,
  quantity        INT NOT NULL DEFAULT 1,
  estimated_price DECIMAL(12, 2),
  CONSTRAINT valid_cart_rental_period CHECK (rental_end > rental_start)
);

CREATE TABLE IF NOT EXISTS wishlists (
  wishlist_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renter_profile_id UUID UNIQUE NOT NULL REFERENCES renter_profiles(renter_profile_id) ON DELETE CASCADE
);

-- Many-to-many: wishlists <-> products
CREATE TABLE IF NOT EXISTS wishlist_products (
  wishlist_id UUID NOT NULL REFERENCES wishlists(wishlist_id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (wishlist_id, product_id)
);


-- =============================================
-- GROUP 4: VOUCHER (1 table)
-- =============================================

CREATE TABLE IF NOT EXISTS vouchers (
  voucher_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           VARCHAR(100) UNIQUE NOT NULL,
  discount_type  VARCHAR(20) NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
  discount_value DECIMAL(12, 2) NOT NULL,
  valid_from     TIMESTAMPTZ NOT NULL,
  valid_to       TIMESTAMPTZ NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT valid_voucher_period CHECK (valid_to > valid_from)
);


-- =============================================
-- GROUP 5: ORDER (5 tables)
-- =============================================

CREATE TABLE IF NOT EXISTS penalty_policies (
  policy_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(255) NOT NULL DEFAULT 'Standard',
  late_fee_per_day        DECIMAL(12, 2) NOT NULL,
  damage_penalty_rate     DECIMAL(5, 4) NOT NULL,  -- e.g. 0.30 = 30%
  lost_item_penalty_rate  DECIMAL(5, 4) NOT NULL
);

CREATE TABLE IF NOT EXISTS rental_orders (
  order_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renter_profile_id  UUID NOT NULL REFERENCES renter_profiles(renter_profile_id),
  address_id         UUID NOT NULL REFERENCES addresses(address_id),
  voucher_id         UUID REFERENCES vouchers(voucher_id),
  penalty_policy_id  UUID NOT NULL REFERENCES penalty_policies(policy_id),
  status             "OrderStatus" NOT NULL DEFAULT 'DRAFT',
  payment_status     "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  rental_start       TIMESTAMPTZ NOT NULL,
  rental_end         TIMESTAMPTZ NOT NULL,
  subtotal           DECIMAL(12, 2) NOT NULL DEFAULT 0,
  discount_amount    DECIMAL(12, 2) NOT NULL DEFAULT 0,
  deposit_amount     DECIMAL(12, 2) NOT NULL DEFAULT 0,
  shipping_fee       DECIMAL(12, 2) NOT NULL DEFAULT 0,
  late_fee           DECIMAL(12, 2) NOT NULL DEFAULT 0,
  damage_fee         DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_amount       DECIMAL(12, 2) NOT NULL DEFAULT 0,
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at       TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  CONSTRAINT valid_order_rental_period CHECK (rental_end > rental_start)
);

CREATE TABLE IF NOT EXISTS rental_order_items (
  order_item_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES rental_orders(order_id) ON DELETE CASCADE,
  variant_id        UUID NOT NULL REFERENCES product_variants(variant_id),
  quantity          INT NOT NULL DEFAULT 1,
  unit_price_per_day DECIMAL(12, 2) NOT NULL,
  line_subtotal     DECIMAL(12, 2) NOT NULL,
  line_deposit      DECIMAL(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rental_contracts (
  contract_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID UNIQUE NOT NULL REFERENCES rental_orders(order_id) ON DELETE CASCADE,
  terms_snapshot  TEXT NOT NULL,
  signed_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pickup_return_records (
  record_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               UUID UNIQUE NOT NULL REFERENCES rental_orders(order_id) ON DELETE CASCADE,
  pickup_at              TIMESTAMPTZ,
  returned_at            TIMESTAMPTZ,
  pickup_condition_note  TEXT,
  return_condition_note  TEXT
);


-- =============================================
-- GROUP 6: PAYMENT (4 tables)
-- =============================================

CREATE TABLE IF NOT EXISTS wallets (
  wallet_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renter_profile_id UUID UNIQUE NOT NULL REFERENCES renter_profiles(renter_profile_id) ON DELETE CASCADE,
  balance           DECIMAL(14, 2) NOT NULL DEFAULT 0,
  held_balance      DECIMAL(14, 2) NOT NULL DEFAULT 0,
  CONSTRAINT non_negative_balance CHECK (balance >= 0),
  CONSTRAINT non_negative_held   CHECK (held_balance >= 0)
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES rental_orders(order_id) ON DELETE CASCADE,
  method         "PaymentMethodType" NOT NULL,
  amount         DECIMAL(14, 2) NOT NULL,
  external_ref   VARCHAR(255),
  status         "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refund_transactions (
  refund_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES rental_orders(order_id) ON DELETE CASCADE,
  amount      DECIMAL(14, 2) NOT NULL,
  reason      TEXT,
  refunded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escrow_transactions (
  escrow_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID UNIQUE NOT NULL REFERENCES rental_orders(order_id) ON DELETE CASCADE,
  amount_held    DECIMAL(14, 2) NOT NULL,
  held_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at    TIMESTAMPTZ,
  release_reason TEXT
);


-- =============================================
-- GROUP 7: SHIPPING (1 table)
-- =============================================

CREATE TABLE IF NOT EXISTS shipments (
  shipment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID UNIQUE NOT NULL REFERENCES rental_orders(order_id) ON DELETE CASCADE,
  status        "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
  courier_name  VARCHAR(255),
  tracking_code VARCHAR(255),
  shipped_at    TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ
);


-- =============================================
-- GROUP 8: REVIEW / DISPUTE (3 tables)
-- =============================================

-- Polymorphic: target_type xác định target_id là shop_id / renter_profile_id / product_id
CREATE TABLE IF NOT EXISTS reviews (
  review_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renter_profile_id UUID NOT NULL REFERENCES renter_profiles(renter_profile_id),
  order_id          UUID REFERENCES rental_orders(order_id),
  target_type       "ReviewTargetType" NOT NULL,
  target_id         UUID NOT NULL,
  rating            INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS complaints (
  complaint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES rental_orders(order_id) ON DELETE CASCADE,
  title        VARCHAR(500) NOT NULL,
  description  TEXT,
  status       VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disputes (
  dispute_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID UNIQUE NOT NULL REFERENCES rental_orders(order_id),
  admin_id    UUID REFERENCES admin_profiles(admin_id),
  reason      TEXT,
  resolution  TEXT,
  status      VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);


-- =============================================
-- GROUP 9: NOTIFICATION / CHAT (4 tables)
-- =============================================

CREATE TABLE IF NOT EXISTS notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  type            "NotificationType" NOT NULL,
  title           VARCHAR(500) NOT NULL,
  content         TEXT,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Many-to-many: conversations <-> user_profiles
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  message_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES user_profiles(user_id),
  content         TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read         BOOLEAN NOT NULL DEFAULT FALSE
);


-- =============================================
-- INDEXES (performance)
-- =============================================

CREATE INDEX IF NOT EXISTS idx_products_shop         ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_category     ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status       ON products(status);
CREATE INDEX IF NOT EXISTS idx_product_variants_prod ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variant     ON inventory_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status      ON inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_orders_renter         ON rental_orders(renter_profile_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON rental_orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order     ON rental_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_pay_tx_order          ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_target        ON reviews(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_messages_conv         ON messages(conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart       ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_blocked_periods_cal   ON calendar_blocked_periods(calendar_id);


-- =============================================
-- SEED: Default roles & penalty policy
-- =============================================

INSERT INTO roles (role_name) VALUES
  ('RENTER'),
  ('SHOP_OWNER'),
  ('ADMIN')
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO penalty_policies (name, late_fee_per_day, damage_penalty_rate, lost_item_penalty_rate) VALUES
  ('Standard', 50000, 0.30, 1.00)
ON CONFLICT DO NOTHING;
