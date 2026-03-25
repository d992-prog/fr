from datetime import datetime, timezone
from types import SimpleNamespace

from app.worker.scheduling import resolve_runtime_schedule


def make_domain(**overrides):
    base = {
        "manual_burst": False,
        "scheduler_mode": "continuous",
        "check_interval": 1.5,
        "burst_check_interval": 0.35,
        "pattern_slow_interval": 15.0,
        "pattern_fast_interval": 0.5,
        "pattern_window_start_minute": 31,
        "pattern_window_end_minute": 34,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_resolve_runtime_schedule_keeps_continuous_mode():
    runtime = resolve_runtime_schedule(
        make_domain(),
        "normal",
        datetime(2026, 3, 23, 14, 10, tzinfo=timezone.utc),
    )
    assert runtime.mode == "normal"
    assert runtime.interval == 1.5


def test_resolve_runtime_schedule_uses_pattern_fast_inside_window():
    runtime = resolve_runtime_schedule(
        make_domain(scheduler_mode="pattern"),
        "normal",
        datetime(2026, 3, 23, 14, 32, tzinfo=timezone.utc),
    )
    assert runtime.mode == "pattern-fast"
    assert runtime.interval == 0.5


def test_resolve_runtime_schedule_uses_pattern_slow_outside_window():
    runtime = resolve_runtime_schedule(
        make_domain(scheduler_mode="pattern"),
        "normal",
        datetime(2026, 3, 23, 14, 10, tzinfo=timezone.utc),
    )
    assert runtime.mode == "pattern-slow"
    assert runtime.interval == 15.0
