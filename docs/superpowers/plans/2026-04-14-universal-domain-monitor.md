# Universal Domain Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `.fr` monitor accept and check domains across public TLDs, fix captured-domain and mode-switch behavior, and polish the dashboard for release.

**Architecture:** Add a small backend registry/RDAP adapter layer, keep worker decisions centered in `app.worker.decision`, and keep UI pagination/timezone state inside the existing React app. Avoid per-cycle RDAP bootstrap fetches by resolving and caching zone endpoints.

**Tech Stack:** FastAPI, async SQLAlchemy, httpx, dnspython, Pydantic, pytest, React, TypeScript, Vite.

---

### Task 1: General Domain Parsing

**Files:**
- Modify: `backend/app/services/domain_parser.py`
- Modify: `backend/app/api/routes/domains.py`
- Test: `backend/tests/test_domain_parser.py`

- [ ] **Step 1: Write failing parser tests**

Add tests that assert:

```python
def test_normalize_domain_accepts_non_fr_domain():
    assert normalize_domain("https://Example.COM/path") == "example.com"


def test_normalize_domain_accepts_idn_domain_as_alabel():
    assert normalize_domain("пример.рф") == "xn--e1afmkfd.xn--p1ai"


def test_normalize_domain_rejects_invalid_domain():
    assert normalize_domain("-bad.com") is None
    assert normalize_domain("localhost") is None
```

- [ ] **Step 2: Run parser tests and confirm red**

Run: `python -m pytest tests/test_domain_parser.py -q` from `backend`.

Expected: `.com` and IDN cases fail under the current `.fr` regex.

- [ ] **Step 3: Implement generic normalization**

Replace the `.fr`-only regex with label validation plus IDNA encoding. Return lowercase A-label domain names and derive `zone` in `create_domain` from `normalized.rsplit(".", 1)[1]`.

- [ ] **Step 4: Run parser tests and confirm green**

Run: `python -m pytest tests/test_domain_parser.py -q` from `backend`.

Expected: all parser tests pass.

### Task 2: RDAP Registry Adapter

**Files:**
- Create: `backend/app/worker/registry.py`
- Modify: `backend/app/worker/checks.py`
- Test: `backend/tests/test_registry.py`

- [ ] **Step 1: Write failing registry tests**

Create tests with a static bootstrap payload:

```python
def test_resolves_rdap_base_url_from_bootstrap():
    registry = RdapBootstrapRegistry.from_payload({
        "services": [[["com", "net"], ["https://rdap.verisign.com/com/v1/"]]]
    })
    assert registry.resolve("example.com") == "https://rdap.verisign.com/com/v1/"


def test_fr_uses_configured_override():
    registry = RdapBootstrapRegistry.from_payload({"services": []}, fr_base_url="https://rdap.nic.fr/domain/")
    assert registry.resolve("example.fr") == "https://rdap.nic.fr/domain/"
```

- [ ] **Step 2: Run registry tests and confirm red**

Run: `python -m pytest tests/test_registry.py -q` from `backend`.

Expected: import fails because registry module does not exist.

- [ ] **Step 3: Implement cached resolver**

Implement `RdapBootstrapRegistry` with in-memory zone-to-base-url mapping, `.fr` override support, and a helper that builds `base.rstrip("/") + "/" + domain`. Keep network bootstrap fetching optional and cached, not per worker cycle.

- [ ] **Step 4: Wire RDAP checks**

Update `rdap_check(domain, settings, proxy=None)` so it asks the registry layer for the correct target URL instead of always using `settings.rdap_base_url`.

- [ ] **Step 5: Run registry and existing worker tests**

Run: `python -m pytest tests/test_registry.py tests/test_decision.py tests/test_scheduling.py -q` from `backend`.

Expected: registry tests pass; any existing decision mismatch becomes the next task's red signal.

### Task 3: Captured-Domain and Availability Fixes

**Files:**
- Modify: `backend/app/worker/decision.py`
- Modify: `backend/app/worker/engine.py`
- Test: `backend/tests/test_decision.py`

- [ ] **Step 1: Update failing decision tests**

Add tests that assert a domain with `status="available"` becomes `captured` when DNS exists and RDAP is found, and that a domain confirmed available requests an alert.

- [ ] **Step 2: Run decision tests and confirm red/meaningful failures**

Run: `python -m pytest tests/test_decision.py -q` from `backend`.

Expected: current stale `burst` expectations or new capture cases fail, revealing current behavior.

- [ ] **Step 3: Implement decision behavior**

Align tests and implementation around current scheduler modes: `normal`, `pattern-slow`, `pattern-fast`, `available-watch`, `available-stop`, `capture-watch`, `captured`. Do not resurrect legacy `burst` unless manual burst remains a real runtime mode.

- [ ] **Step 4: Ensure engine persists availability/capture**

In `_run_cycle`, set `available_at` when status first becomes `available`, keep the short capture-watch interval, and set `is_active=False` when status becomes `captured`.

- [ ] **Step 5: Run decision tests**

Run: `python -m pytest tests/test_decision.py -q` from `backend`.

Expected: all decision tests pass.

### Task 4: Mode Switching and Watchdog Health

**Files:**
- Modify: `backend/app/api/routes/domains.py`
- Modify: `backend/app/worker/engine.py`
- Modify: `backend/app/api/routes/health.py`
- Test: `backend/tests/test_scheduling.py`

- [ ] **Step 1: Add scheduling tests**

Add tests that verify `resolve_runtime_schedule` returns continuous interval immediately when `scheduler_mode="continuous"` and pattern interval when `scheduler_mode="pattern"`.

- [ ] **Step 2: Run scheduling tests**

Run: `python -m pytest tests/test_scheduling.py -q` from `backend`.

Expected: existing schedule cases pass; add a health helper test if a helper is extracted.

- [ ] **Step 3: Restart/wake worker on scheduler changes**

When `scheduler_mode` or timing fields change in `PATCH /domains/{id}`, restart the worker if active so old long sleeps are canceled.

- [ ] **Step 4: Avoid false stale alerts**

Extract health stale calculation or align it with `expected_runtime_interval(domain)` so long planned sleeps and available-stop intervals are not counted as stuck workers.

- [ ] **Step 5: Run backend targeted tests**

Run: `python -m pytest tests/test_scheduling.py tests/test_decision.py -q` from `backend`.

Expected: targeted backend tests pass.

### Task 5: User Timezone Persistence

**Files:**
- Modify: `backend/app/db/models.py`
- Modify: `backend/app/db/migrations.py`
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/api/routes/auth.py`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add backend schema support**

Add `User.timezone = "Europe/Moscow"` default, startup migration column, request schema for profile/timezone update, and include timezone in `UserResponse`.

- [ ] **Step 2: Add frontend type and selector**

Add `timezone` to `User`, keep `selectedTimezone` state from session/local fallback, and format dates with `timeZone: selectedTimezone`.

- [ ] **Step 3: Verify timezone formatting manually in code**

Check all `formatPreciseDate(...)` calls either receive the selected timezone or use a wrapper tied to current state.

### Task 6: Dashboard Pagination and Release Copy

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Add pagination helpers**

Add a small `paginate(items, page, pageSize)` helper and per-list state for domains, proxies, and logs.

- [ ] **Step 2: Apply pagination**

Render only the selected page for `filteredDomains`, `proxies`, and `logs`, with page-size selects such as `25`, `50`, `100`, `200`.

- [ ] **Step 3: Clean release copy**

Replace `.fr`-only product text with generic domain monitoring copy and update placeholders from `example.fr` to `example.com`.

- [ ] **Step 4: Align CSS**

Adjust card metrics, controls, and list rows so Russian text wraps cleanly and stable grid columns do not jump.

- [ ] **Step 5: Build frontend**

Run: `npm install` if dependencies are missing, then `npm run build` in `frontend`.

Expected: TypeScript and Vite build pass.

### Task 7: Final Verification

**Files:**
- Modify: `README.md`
- Modify: `backend/.env.example`

- [ ] **Step 1: Update docs**

Document universal TLD support, IANA RDAP bootstrap use, timezone display, and the `.fr` adapter note.

- [ ] **Step 2: Run backend tests**

Run: `python -m pytest -q` in `backend`.

Expected: all backend tests pass. If dependencies are missing, install backend dev dependencies first.

- [ ] **Step 3: Run frontend build**

Run: `npm run build` in `frontend`.

Expected: build passes.

- [ ] **Step 4: Inspect git diff**

Run: `git diff --stat` and `git status --short`.

Expected: only intended source, test, docs, and config example files changed.
