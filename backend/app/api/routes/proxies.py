from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_feature_access
from app.db.models import Proxy, User
from app.db.session import get_db
from app.schemas.common import MessageResponse
from app.schemas.proxy import ProxyCreateRequest, ProxyResponse
from app.services.masking import mask_secret
from app.services.proxy_utils import build_proxy_url, parse_proxy_url
from app.services.security import user_has_feature_access

router = APIRouter(prefix="/proxies", tags=["proxies"])


def serialize_proxy(proxy: Proxy, *, masked: bool) -> ProxyResponse:
    display_url = build_proxy_url(proxy)
    if masked:
        display_url = mask_secret(display_url, keep=4) or display_url

    return ProxyResponse(
        id=proxy.id,
        host=mask_secret(proxy.host, keep=3) if masked else proxy.host,
        port=proxy.port,
        login=mask_secret(proxy.login, keep=1) if masked else proxy.login,
        password="***" if masked and proxy.password else proxy.password,
        type=proxy.type,
        status=proxy.status,
        fail_count=proxy.fail_count,
        last_used=proxy.last_used,
        created_at=proxy.created_at,
        display_url=display_url,
    )


@router.get("", response_model=list[ProxyResponse])
async def list_proxies(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ProxyResponse]:
    result = await db.execute(select(Proxy).where(Proxy.owner_id == user.id).order_by(Proxy.created_at.desc()))
    masked = not user_has_feature_access(user) and user.role not in {"owner", "admin"}
    return [serialize_proxy(proxy, masked=masked) for proxy in result.scalars().all()]


@router.post("", response_model=ProxyResponse, status_code=status.HTTP_201_CREATED)
async def create_proxy(
    payload: ProxyCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature_access),
) -> ProxyResponse:
    try:
        parsed = parse_proxy_url(payload.proxy_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    proxy = Proxy(**parsed, owner_id=user.id, status="active", fail_count=0)
    db.add(proxy)
    await db.commit()
    await db.refresh(proxy)
    return serialize_proxy(proxy, masked=False)


@router.delete("/{proxy_id}", response_model=MessageResponse)
async def delete_proxy(
    proxy_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_feature_access),
) -> MessageResponse:
    proxy = await db.get(Proxy, proxy_id)
    if proxy is None or proxy.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Proxy not found")

    await db.delete(proxy)
    await db.commit()
    return MessageResponse(detail="Proxy deleted")
