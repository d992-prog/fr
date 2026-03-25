from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.worker.scheduling import resolve_runtime_schedule
from app.db.base import utcnow
from app.db.models import Domain, User
from app.db.session import get_db
from app.core.config import get_settings
from app.schemas.common import DomainHealthItem, HealthResponse, MonitoringHealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def healthcheck() -> HealthResponse:
    return HealthResponse(status="ok", checked_at=utcnow())


@router.get("/health/monitoring", response_model=MonitoringHealthResponse)
async def monitoring_health(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MonitoringHealthResponse:
    settings = get_settings()
    now = utcnow()
    query = select(Domain).where(Domain.is_active.is_(True)).order_by(Domain.domain.asc())
    if user.role not in {"owner", "admin"}:
        query = query.where(Domain.owner_id == user.id)
    result = await db.execute(query)
    domains = result.scalars().all()
    items: list[DomainHealthItem] = []

    for domain in domains:
        stale = False
        if domain.worker_heartbeat_at is not None:
            age = (now - domain.worker_heartbeat_at).total_seconds()
            expected_interval = resolve_runtime_schedule(domain, domain.check_mode, now).interval
            allowed_age = max(
                float(settings.worker_stall_threshold_seconds),
                float(expected_interval) + 10.0,
            )
            stale = age > allowed_age
        items.append(
            DomainHealthItem(
                domain_id=domain.id,
                domain=domain.domain,
                status=domain.status,
                check_mode=domain.check_mode,
                last_check_at=domain.last_check_at,
                worker_heartbeat_at=domain.worker_heartbeat_at,
                consecutive_failures=domain.consecutive_failures,
                is_stale=stale,
            )
        )

    stale_count = sum(1 for item in items if item.is_stale)
    workers_in_memory = request.app.state.monitoring.worker_count() if user.role in {"owner", "admin"} else len(items)
    return MonitoringHealthResponse(
        status="ok" if stale_count == 0 else "degraded",
        checked_at=now,
        active_domains=len(items),
        stale_domains=stale_count,
        workers_in_memory=workers_in_memory,
        items=items,
    )
