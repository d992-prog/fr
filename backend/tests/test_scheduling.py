from datetime import datetime, timezone
from types import SimpleNamespace

from app.worker.scheduling import expected_runtime_interval, resolve_runtime_schedule


def make_domain(**overrides):
    base = {
        "id": 1,
        "manual_burst": False,
        "scheduler_mode": "continuous",
        "check_interval": 1.5,
        "burst_check_interval": 0.35,
        "pattern_slow_interval": 15.0,
        "pattern_fast_interval": 0.5,
        "pattern_window_start_minute": 31,
        "pattern_window_end_minute": 34,
        "available_recheck_interval": 1800.0,
        "check_mode": "normal",
        "available_at": None,
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
    assert runtime.interval == 14.25


def test_resolve_runtime_schedule_wakes_before_pattern_window_even_with_long_slow_interval():
    runtime = resolve_runtime_schedule(
        make_domain(scheduler_mode="pattern", pattern_slow_interval=900.0),
        "normal",
        datetime(2026, 3, 23, 14, 30, 55, tzinfo=timezone.utc),
    )
    assert runtime.mode == "pattern-slow"
    assert runtime.interval == 5.0


def test_expected_runtime_interval_uses_last_applied_pattern_mode():
    interval = expected_runtime_interval(
        make_domain(
            scheduler_mode="pattern",
            pattern_slow_interval=900.0,
            pattern_fast_interval=0.5,
            check_mode="pattern-slow",
        )
    )
    assert interval == 855.0
