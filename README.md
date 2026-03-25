# FR Domain Drop Monitor

Production-oriented `.fr` drop monitor with:

- FastAPI + async SQLAlchemy + PostgreSQL
- Per-domain asyncio workers with heartbeat supervision and auto-restart
- DNS + RDAP checks, multi-proxy RDAP fallback, and anti-false-positive confirmations
- `pattern` scheduler mode for hourly drop windows
- Multi-user auth with roles: `owner`, `admin`, `user`
- Pending approval flow, subscriptions, promo codes, and admin audit logs
- Per-user isolated domains, proxies, and Telegram settings
- React dashboard with login/profile/admin UI and RU/EN switch

## Main Features

- Every domain runs in its own async worker.
- Stalled workers are detected and restarted automatically.
- Outside the drop window, pattern mode can check slowly; inside the window it accelerates.
- If direct RDAP fails, the worker can try several healthy SOCKS5 proxies in one cycle.
- Users only see their own domains and proxies.
- Users can log in before approval, but actions stay blocked until approval or promo activation.
- Admins can create users, approve/block them, grant access time, soft-delete/restore them, and create promo codes.

## Repository Layout

- `backend/` API, workers, auth/admin logic, notifier, tests
- `frontend/` React + Vite UI
- `deploy/domain-drop-monitor.service` sample `systemd` service

## Backend Setup

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -e .[dev]
```

Create `backend/.env` from `backend/.env.example` and fill at least:

```env
DB_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/frdrop
SESSION_SECRET_KEY=change-me-session-secret
OWNER_LOGIN=france_admin
OWNER_PASSWORD=change-me-owner-password
```

Optional Telegram defaults are still present in config, but user-facing alerts now use each user's own bot token/chat ID from the profile page.

Run the API:

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Tables are auto-created on startup. Lightweight startup migrations add missing columns/indexes for older databases.

## Frontend Setup

```bash
cd frontend
npm install
npm run build
```

When `frontend/dist` exists, FastAPI serves the built UI automatically.

## Important Environment Variables

- `OWNER_LOGIN`, `OWNER_PASSWORD`: bootstrap the first owner account
- `SESSION_SECRET_KEY`: session/security secret
- `SESSION_COOKIE_SECURE`: set `true` after HTTPS is enabled
- `PATTERN_SLOW_INTERVAL`: default slow check interval outside the drop window
- `PATTERN_FAST_INTERVAL`: default fast check interval inside the drop window
- `PATTERN_WINDOW_START_MINUTE`, `PATTERN_WINDOW_END_MINUTE`: hourly window boundaries
- `WORKER_STALL_THRESHOLD_SECONDS`: how long a worker heartbeat may stall before restart
- `MAX_PROXY_ATTEMPTS_PER_CYCLE`: how many proxies may be tried in one RDAP fallback cycle

## API Overview

- `GET /api/health`
- `GET /api/health/monitoring`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/telegram`
- `POST /api/auth/telegram/test`
- `POST /api/auth/promo/apply`
- `GET /api/domains`
- `POST /api/domains`
- `POST /api/domains/upload`
- `PATCH /api/domains/{id}`
- `DELETE /api/domains/{id}`
- `GET /api/proxies`
- `POST /api/proxies`
- `DELETE /api/proxies/{id}`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/{id}`
- `POST /api/admin/users/{id}/grant-access`
- `POST /api/admin/users/{id}/soft-delete`
- `POST /api/admin/users/{id}/restore`
- `DELETE /api/admin/users/{id}`
- `GET /api/admin/promo-codes`
- `POST /api/admin/promo-codes`
- `GET /api/admin/audit-logs`

## Fresh Multi-User Rollout

If you are moving from the earlier single-user build and want a clean start:

1. Stop the service.
2. Backup the database if needed.
3. Clear old monitoring data/tables or recreate the database.
4. Pull the updated code.
5. Reinstall backend dependencies, rebuild the frontend, and restart the service.
6. Set `OWNER_LOGIN` / `OWNER_PASSWORD` in `.env` before the first start so the owner account is seeded automatically.

## Updating An Existing Server

Use this sequence when the app is already running on the VPS:

```bash
cd /opt/fr-domain-drop-monitor
git pull
cd /opt/fr-domain-drop-monitor/backend
source .venv/bin/activate
pip install -e .[dev]
cd /opt/fr-domain-drop-monitor/frontend
npm install
npm run build
cp /opt/fr-domain-drop-monitor/deploy/domain-drop-monitor.service /etc/systemd/system/domain-drop-monitor.service
systemctl daemon-reload
systemctl restart domain-drop-monitor.service
systemctl status domain-drop-monitor.service --no-pager
```

## Recommended Production Topology

For a custom domain, run the app behind Nginx:

- `systemd` service runs Uvicorn on `127.0.0.1:8000`
- Nginx listens on `80/443`
- Cloudflare DNS record points the domain to the server
- after HTTPS is enabled, set `SESSION_COOKIE_SECURE=true`

This repository's sample `systemd` unit already uses the private `127.0.0.1:8000` binding expected by Nginx.
Use `deploy/nginx-fr-domain-monitor.conf` as the starting point for the Nginx site config.

## Notes

- This workspace does not currently have `python`, `node`, or `npm` on PATH, so runtime verification must be done on the target machine.
- For HTTPS deployments, place Nginx in front of the app and set `SESSION_COOKIE_SECURE=true`.
