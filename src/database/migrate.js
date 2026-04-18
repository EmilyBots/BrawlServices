// src/database/migrate.js
const db = require('./index');

const migrations = `
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20) NOT NULL,
  service_type VARCHAR(50) NOT NULL,
  from_rank VARCHAR(30),
  to_rank VARCHAR(30),
  boost_type VARCHAR(20) DEFAULT 'boost',
  price NUMERIC(10,2) NOT NULL,
  currency VARCHAR(5) DEFAULT 'EUR',
  status VARCHAR(20) DEFAULT 'pending',
  booster_id VARCHAR(20),
  payment_method VARCHAR(30),
  payment_status VARCHAR(20) DEFAULT 'unpaid',
  payment_id VARCHAR(200),
  notes TEXT,
  ticket_channel_id VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id VARCHAR(20) UNIQUE NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20) NOT NULL,
  category VARCHAR(30) DEFAULT 'general',
  status VARCHAR(20) DEFAULT 'open',
  order_id UUID,
  claimed_by VARCHAR(20),
  priority VARCHAR(10) DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vouches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20) NOT NULL,
  booster_id VARCHAR(20),
  order_id UUID,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20) NOT NULL,
  brawler_count INTEGER,
  max_trophies INTEGER,
  current_rank VARCHAR(30),
  price NUMERIC(10,2) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'available',
  buyer_id VARCHAR(20),
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(20) NOT NULL,
  coach_id VARCHAR(20),
  guild_id VARCHAR(20) NOT NULL,
  session_type VARCHAR(30),
  duration_hours INTEGER DEFAULT 1,
  price NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  ticket_channel_id VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID,
  user_id VARCHAR(20) NOT NULL,
  method VARCHAR(30) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(5) DEFAULT 'EUR',
  status VARCHAR(20) DEFAULT 'pending',
  external_id VARCHAR(200),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(20) PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  username VARCHAR(100),
  total_spent NUMERIC(10,2) DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id VARCHAR(20) NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_id VARCHAR(20),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_vouches_user ON vouches(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
`;

async function migrate() {
  try {
    console.log('🗄️  Running database migrations...');
    await db.query(migrations);
    console.log('✅  Migrations complete!');
  } catch (err) {
    // Log but don't crash — tables may already exist
    console.error('⚠️  Migration warning:', err.message);
  }
}

// Allow running directly: node src/database/migrate.js
if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = migrate;

  payment_status VARCHAR(20) DEFAULT 'unpaid',
  payment_id VARCHAR(100),
  notes TEXT,
  ticket_channel_id VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id VARCHAR(20) UNIQUE NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20) NOT NULL,
  category VARCHAR(30) DEFAULT 'general',
  status VARCHAR(20) DEFAULT 'open',
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  claimed_by VARCHAR(20),
  priority VARCHAR(10) DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vouches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20) NOT NULL,
  booster_id VARCHAR(20),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id VARCHAR(20) NOT NULL,
  guild_id VARCHAR(20) NOT NULL,
  brawler_count INTEGER,
  max_trophies INTEGER,
  current_rank VARCHAR(30),
  price NUMERIC(10,2) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'available',
  buyer_id VARCHAR(20),
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(20) NOT NULL,
  coach_id VARCHAR(20),
  guild_id VARCHAR(20) NOT NULL,
  session_type VARCHAR(30),
  duration_hours INTEGER DEFAULT 1,
  price NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  ticket_channel_id VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID,
  user_id VARCHAR(20) NOT NULL,
  method VARCHAR(30) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(5) DEFAULT 'EUR',
  status VARCHAR(20) DEFAULT 'pending',
  external_id VARCHAR(200),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(20) PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  username VARCHAR(100),
  total_spent NUMERIC(10,2) DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id VARCHAR(20) NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_id VARCHAR(20),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_vouches_user ON vouches(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🗄️  Running database migrations...');
    await client.query(migrations);
    console.log('✅  Migrations complete!');
  } catch (err) {
    console.error('❌  Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
