from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="user", server_default="user")
    status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
    language: Mapped[str] = mapped_column(String(8), default="ru", server_default="ru")
    max_domains: Mapped[int | None] = mapped_column(Integer, nullable=True)
    access_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    telegram_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    login_failed_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    login_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )

    domains: Mapped[list["Domain"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    proxies: Mapped[list["Proxy"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    promo_redemptions: Mapped[list["PromoRedemption"]] = relationship(back_populates="user")


class Domain(Base):
    __tablename__ = "domains"
    __table_args__ = (UniqueConstraint("owner_id", "domain", name="uq_domains_owner_domain"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    domain: Mapped[str] = mapped_column(String(255), index=True)
    zone: Mapped[str] = mapped_column(String(16), default="fr", server_default="fr")
    status: Mapped[str] = mapped_column(String(32), default="active", server_default="active")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    manual_burst: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    scheduler_mode: Mapped[str] = mapped_column(
        String(32),
        default="continuous",
        server_default="continuous",
    )
    check_interval: Mapped[float] = mapped_column(Float, default=1.5, server_default="1.5")
    burst_check_interval: Mapped[float] = mapped_column(Float, default=0.35, server_default="0.35")
    pattern_slow_interval: Mapped[float] = mapped_column(Float, default=60.0, server_default="60.0")
    pattern_fast_interval: Mapped[float] = mapped_column(Float, default=0.5, server_default="0.5")
    pattern_window_start_minute: Mapped[int] = mapped_column(Integer, default=31, server_default="31")
    pattern_window_end_minute: Mapped[int] = mapped_column(Integer, default=34, server_default="34")
    confirmation_threshold: Mapped[int] = mapped_column(Integer, default=3, server_default="3")
    available_recheck_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    available_recheck_interval: Mapped[float] = mapped_column(
        Float,
        default=1800.0,
        server_default="1800.0",
    )
    check_mode: Mapped[str] = mapped_column(String(16), default="normal", server_default="normal")
    last_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_cycle_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    worker_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    available_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_owner: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_seen_rdap_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_owner_change_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    available_confirmations: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    alert_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )

    owner: Mapped[User | None] = relationship(back_populates="domains")
    logs: Mapped[list["Log"]] = relationship(
        back_populates="domain_ref",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Proxy(Base):
    __tablename__ = "proxies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    host: Mapped[str] = mapped_column(String(255))
    port: Mapped[int] = mapped_column(Integer)
    login: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    type: Mapped[str] = mapped_column(String(32), default="socks5", server_default="socks5")
    status: Mapped[str] = mapped_column(String(32), default="active", server_default="active")
    fail_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_used: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    owner: Mapped[User | None] = relationship(back_populates="proxies")


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    domain_id: Mapped[int | None] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    domain_ref: Mapped[Domain | None] = relationship(back_populates="logs")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    remember_me: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    user: Mapped[User] = relationship(back_populates="sessions")


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    max_activations: Mapped[int | None] = mapped_column(Integer, nullable=True)
    activation_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )

    redemptions: Mapped[list["PromoRedemption"]] = relationship(
        back_populates="promo_code",
        cascade="all, delete-orphan",
    )


class PromoRedemption(Base):
    __tablename__ = "promo_redemptions"
    __table_args__ = (UniqueConstraint("promo_code_id", "user_id", name="uq_promo_code_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    promo_code_id: Mapped[int] = mapped_column(ForeignKey("promo_codes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    redeemed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )

    promo_code: Mapped[PromoCode] = relationship(back_populates="redemptions")
    user: Mapped[User] = relationship(back_populates="promo_redemptions")


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    target_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(64))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        server_default=func.now(),
    )
