from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.db.models import Domain


@dataclass(slots=True)
class RuntimeSchedule:
    mode: str
    interval: float


def resolve_runtime_schedule(domain: Domain, base_mode: str, now: datetime) -> RuntimeSchedule:
    if domain.available_at is not None:
        seconds_since_available = (now - domain.available_at).total_seconds()
        if seconds_since_available <= 15 and base_mode in {"available-watch", "available-stop"}:
            return RuntimeSchedule(mode="capture-watch", interval=max(0.1, domain.pattern_fast_interval))

    if base_mode == "available-watch":
        return RuntimeSchedule(
            mode="available-watch",
            interval=max(10.0, domain.available_recheck_interval),
        )

    if base_mode == "available-stop":
        return RuntimeSchedule(
            mode="available-stop",
            interval=max(10.0, domain.available_recheck_interval),
        )

    if domain.scheduler_mode == "pattern":
        start = max(0, min(59, domain.pattern_window_start_minute))
        end = max(0, min(59, domain.pattern_window_end_minute))
        minute = now.minute
        in_window = start <= end and start <= minute <= end
        if in_window:
            return RuntimeSchedule(
                mode="pattern-fast",
                interval=max(0.1, domain.pattern_fast_interval),
            )
        slow_interval = max(1.0, domain.pattern_slow_interval)
        spread = (((domain.id or 1) * 37) % 11 - 5) / 20
        return RuntimeSchedule(
            mode="pattern-slow",
            interval=max(1.0, slow_interval * (1 + spread)),
        )

    return RuntimeSchedule(mode="normal", interval=max(0.1, domain.check_interval))
