# Universal Domain Monitor Design

## Goal

Turn the current `.fr` drop monitor into a release-ready domain monitoring system that can accept domains from any public TLD, while preserving the current reliable `.fr` behavior and fixing the monitoring/UI issues found during real usage.

## Scope

This release will add a universal registry adapter layer. The default adapter resolves a domain's TLD and RDAP base URL from the official IANA RDAP DNS bootstrap data. Specific TLD adapters can override the default when we have a verified, stable registry-specific method. `.fr` remains the first explicit adapter because the current system already uses the French registry RDAP service successfully.

The implementation must support frequent checks. RDAP bootstrap discovery must not happen inside every worker cycle. Bootstrap data and per-zone endpoint resolution should be cached in memory, with a conservative fallback to the configured `.fr` endpoint for existing `.fr` domains and a clear error when a TLD has no usable RDAP endpoint.

## Backend Behavior

Domain parsing will accept valid ASCII and IDN domains, normalize them to lowercase A-label form where needed, and derive `zone` from the rightmost label. `.fr`-only regexes will be replaced with a general domain parser. Upload parsing will deduplicate domains across all supported zones.

The checker will call a zone-aware RDAP resolver instead of building every RDAP URL from one global `RDAP_BASE_URL`. RDAP responses will still be reduced to the existing signals: `FOUND`, `NOT_FOUND`, and `ERROR`, plus owner and registration status snapshots where available. DNS remains a generic NXDOMAIN/EXISTS/error signal.

Captured-domain handling will be tightened. After a domain is confirmed available, if later checks show DNS exists and RDAP is found, or RDAP ownership/status returns after the available window, the domain becomes `captured`, logs a capture event, and `is_active` becomes false so the worker stops wasting checks for a domain that will not be available again soon.

`available_at` will be set when availability is confirmed. Owner/status changes will keep updating `last_owner_change_at` and snapshot logs. The "captured" tab should be populated from `status == "captured"`.

Switching `scheduler_mode` between `continuous` and `pattern` must take effect promptly. The API should restart or wake the worker after saving the new mode so it does not keep sleeping on the old pattern interval.

Watchdog health must account for workers intentionally sleeping until a future time. A worker should not be shown as stale merely because it is in a long pattern slow interval or post-availability sleep. Real stalls still remain visible and restartable.

## Time Handling

Server timestamps remain stored in UTC. Scheduling uses server-side UTC plus per-domain window settings. This release will add a persisted user-facing timezone preference for display only, so the user can view checks, availability, owner changes, logs, and access times in their preferred timezone. Future releases can add per-zone default drop windows if we have verified TLD-specific timing data.

## Frontend Behavior

The UI will stop presenting the product as `.fr`-only. The hero copy will remove "Real-Time .fr Monitoring" and the long implementation-focused subtitle. Domain input placeholders will become generic, not `example.fr`.

Domain, proxy, and recent-event lists will get client-side pagination with a user-selectable page size. This is enough for the current single-user scale and avoids risky API contract churn in the first release. The current polling refresh can continue to replace arrays in memory.

Domain cards will keep showing status, runtime mode, applied interval, owner, RDAP status, confirmed availability time, and owner-change time. Layout changes should focus on alignment, wrapping, and stable card metrics in Russian and English.

The profile page will include a timezone selector. The selected timezone will persist on the user record and will be returned in the existing session payload.

## Testing

Add or update backend tests before implementation:

- Domain parser accepts `.fr`, `.com`, multi-label domains, uppercase input, URL input, and IDN input.
- Domain parser rejects invalid labels and domains without a valid TLD.
- RDAP resolver maps zones through bootstrap data and uses `.fr` adapter/default endpoint for `.fr`.
- Decision logic marks a previously available domain as `captured` when DNS and RDAP show it is registered again.
- Availability confirmation sets the expected status and supports setting `available_at` in the engine path.
- Scheduling switches continuous and pattern modes correctly.
- Health stale detection does not flag a domain whose expected runtime interval is still within its sleep window.

Frontend verification:

- `npm run build` passes.
- Domain/proxy/log pagination works for more entries than one page.
- Time formatting uses the selected timezone.
- UI no longer contains `.fr`-only release copy except where describing a real `.fr` adapter or existing domain.

## Out Of Scope

This release will not attempt to hand-code drop windows for every TLD in the world. It will not make unverified claims about specific registries. Registry-specific adapters may be added only when the endpoint or behavior is stable and can be implemented without reducing reliability for the generic path.
