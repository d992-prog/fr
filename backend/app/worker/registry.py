from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class RdapBootstrapRegistry:
    zone_base_urls: dict[str, str]

    @classmethod
    def from_payload(
        cls,
        payload: dict[str, Any],
        *,
        fr_base_url: str | None = None,
    ) -> "RdapBootstrapRegistry":
        zone_base_urls: dict[str, str] = {}
        services = payload.get("services") or []
        for service in services:
            if not isinstance(service, list) or len(service) < 2:
                continue
            zones, urls = service[0], service[1]
            if not isinstance(zones, list) or not isinstance(urls, list) or not urls:
                continue
            base_url = str(urls[0]).strip()
            if not base_url:
                continue
            for zone in zones:
                zone_base_urls[str(zone).lower()] = base_url

        if fr_base_url:
            zone_base_urls["fr"] = fr_base_url

        return cls(zone_base_urls=zone_base_urls)

    def resolve(self, domain: str) -> str | None:
        if "." not in domain:
            return None
        zone = domain.rsplit(".", 1)[-1].lower()
        return self.zone_base_urls.get(zone)


_cached_registry: RdapBootstrapRegistry | None = None
_registry_lock: asyncio.Lock | None = None


def _lock() -> asyncio.Lock:
    global _registry_lock
    if _registry_lock is None:
        _registry_lock = asyncio.Lock()
    return _registry_lock


async def get_cached_rdap_registry(settings: Settings) -> RdapBootstrapRegistry:
    global _cached_registry
    if _cached_registry is not None:
        return _cached_registry

    async with _lock():
        if _cached_registry is not None:
            return _cached_registry
        _cached_registry = await _load_registry(settings)
        return _cached_registry


async def _load_registry(settings: Settings) -> RdapBootstrapRegistry:
    try:
        async with httpx.AsyncClient(
            timeout=settings.rdap_bootstrap_timeout_seconds,
            follow_redirects=True,
        ) as client:
            response = await client.get(settings.rdap_bootstrap_url)
        response.raise_for_status()
        payload = response.json()
    except Exception:
        logger.exception("Failed to load IANA RDAP bootstrap data; only configured overrides are available")
        payload = {"services": []}

    return RdapBootstrapRegistry.from_payload(payload, fr_base_url=settings.rdap_base_url)


async def resolve_domain_rdap_url(domain: str, settings: Settings) -> str | None:
    registry = await get_cached_rdap_registry(settings)
    return build_domain_rdap_url(domain, settings=settings, registry=registry)


def build_domain_rdap_url(
    domain: str,
    *,
    settings: object | None = None,
    registry: RdapBootstrapRegistry,
) -> str | None:
    base_url = registry.resolve(domain)
    if base_url is None and settings is not None and domain.lower().endswith(".fr"):
        base_url = getattr(settings, "rdap_base_url", None)
    if not base_url:
        return None

    base = base_url.rstrip("/")
    parsed = urlsplit(base)
    path = parsed.path.rstrip("/")
    if path.endswith("/domain"):
        return f"{base}/{domain}"
    return f"{base}/domain/{domain}"
