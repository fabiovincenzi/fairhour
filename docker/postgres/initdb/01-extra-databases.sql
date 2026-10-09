-- Runs once, when the Postgres data volume is first created (see docker-compose.yml).
-- The main database `fairhour` is created by POSTGRES_DB.

-- Integration tests (`pnpm test:integration`): migrated and truncated freely, never your dev data.
CREATE DATABASE fairhour_test OWNER fairhour;

-- Playwright E2E tests (`pnpm test:e2e`).
CREATE DATABASE fairhour_e2e OWNER fairhour;
