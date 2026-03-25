from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


MIGRATIONS = (
    "CREATE TABLE IF NOT EXISTS app_settings (id SERIAL PRIMARY KEY, key VARCHAR(128) UNIQUE NOT NULL, value TEXT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())",
    "ALTER TABLE domains DROP CONSTRAINT IF EXISTS domains_domain_key",
    "DROP INDEX IF EXISTS ix_domains_domain",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS owner_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS scheduler_mode VARCHAR(32) DEFAULT 'continuous'",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS pattern_slow_interval DOUBLE PRECISION DEFAULT 60.0",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS pattern_fast_interval DOUBLE PRECISION DEFAULT 0.5",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS pattern_window_start_minute INTEGER DEFAULT 31",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS pattern_window_end_minute INTEGER DEFAULT 34",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS confirmation_threshold INTEGER DEFAULT 3",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS available_recheck_enabled BOOLEAN DEFAULT false",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS available_recheck_interval DOUBLE PRECISION DEFAULT 1800.0",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS last_cycle_started_at TIMESTAMPTZ NULL",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS worker_heartbeat_at TIMESTAMPTZ NULL",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ NULL",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NULL",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS last_seen_owner TEXT NULL",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS last_seen_rdap_status TEXT NULL",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS last_owner_change_at TIMESTAMPTZ NULL",
    "ALTER TABLE domains ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_domains_owner_domain ON domains(owner_id, domain)",
    "ALTER TABLE proxies ADD COLUMN IF NOT EXISTS owner_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE",
    "ALTER TABLE logs ADD COLUMN IF NOT EXISTS owner_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS max_domains INTEGER NULL",
)


async def run_startup_migrations(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        for statement in MIGRATIONS:
            await conn.execute(text(statement))
