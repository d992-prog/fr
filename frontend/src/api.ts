export type Domain = {
  id: number;
  domain: string;
  zone: string;
  status: string;
  is_active: boolean;
  manual_burst: boolean;
  scheduler_mode: string;
  check_interval: number;
  burst_check_interval: number;
  confirmation_threshold: number;
  available_recheck_enabled: boolean;
  available_recheck_interval: number;
  pattern_slow_interval: number;
  pattern_fast_interval: number;
  pattern_window_start_minute: number;
  pattern_window_end_minute: number;
  check_mode: string;
  last_check_at: string | null;
  last_cycle_started_at: string | null;
  worker_heartbeat_at: string | null;
  last_success_at: string | null;
  available_at: string | null;
  last_seen_owner: string | null;
  last_seen_rdap_status: string | null;
  last_owner_change_at: string | null;
  available_confirmations: number;
  consecutive_failures: number;
  alert_sent_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type DomainSettingsPayload = {
  check_interval?: number;
  burst_check_interval?: number;
  scheduler_mode?: string;
  confirmation_threshold?: number;
  available_recheck_enabled?: boolean;
  available_recheck_interval?: number;
  pattern_slow_interval?: number;
  pattern_fast_interval?: number;
  pattern_window_start_minute?: number;
  pattern_window_end_minute?: number;
};

export type ProxyEntry = {
  id: number;
  host: string;
  port: number;
  login: string | null;
  password: string | null;
  type: string;
  status: string;
  fail_count: number;
  last_used: string | null;
  created_at: string;
  display_url: string;
};

export type LogEntry = {
  id: number;
  domain_id: number | null;
  event_type: string;
  message: string;
  created_at: string;
};

export type MonitoringHealthItem = {
  domain_id: number;
  domain: string;
  status: string;
  check_mode: string;
  last_check_at: string | null;
  worker_heartbeat_at: string | null;
  consecutive_failures: number;
  is_stale: boolean;
};

export type MonitoringHealth = {
  status: string;
  checked_at: string;
  active_domains: number;
  stale_domains: number;
  workers_in_memory: number;
  items: MonitoringHealthItem[];
};

export type User = {
  id: number;
  username: string;
  role: string;
  status: string;
  language: string;
  timezone: string;
  max_domains: number | null;
  access_expires_at: string | null;
  status_message: string | null;
  telegram_token: string | null;
  telegram_chat_id: string | null;
  last_login_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionResponse = {
  user: User;
  has_feature_access: boolean;
};

export type AdminUser = {
  id: number;
  username: string;
  role: string;
  status: string;
  language: string;
  max_domains: number | null;
  access_expires_at: string | null;
  status_message: string | null;
  last_login_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  domain_count: number;
  proxy_count: number;
};

export type PromoCode = {
  id: number;
  code: string;
  duration_seconds: number;
  max_activations: number | null;
  activation_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: number;
  actor_user_id: number | null;
  target_user_id: number | null;
  action: string;
  details: string | null;
  created_at: string;
};

export type DiagnosticTelegramSettings = {
  telegram_token: string | null;
  telegram_chat_id: string | null;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { detail?: string };
      throw new Error(payload.detail || `Request failed with ${response.status}`);
    }
    throw new Error((await response.text()) || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  register: (payload: { username: string; password: string; language: string; timezone: string }) =>
    request<SessionResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  login: (payload: { username: string; password: string; remember_me: boolean }) =>
    request<SessionResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () => request<{ detail: string }>("/auth/logout", { method: "POST" }),
  getSession: () => request<SessionResponse>("/auth/me"),
  changePassword: (payload: { current_password: string; new_password: string }) =>
    request<SessionResponse>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProfile: (payload: { language?: string; timezone?: string }) =>
    request<SessionResponse>("/auth/profile", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTelegram: (payload: { telegram_token?: string | null; telegram_chat_id?: string | null }) =>
    request<SessionResponse>("/auth/telegram", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  testTelegram: () => request<{ detail: string }>("/auth/telegram/test", { method: "POST" }),
  applyPromo: (code: string) =>
    request<SessionResponse>("/auth/promo/apply", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  getDomains: () => request<Domain[]>("/domains"),
  createDomain: (payload: { domain: string } & DomainSettingsPayload) =>
    request<{ inserted: Domain[]; skipped: string[] }>("/domains", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createBulkDomains: (payload: { domains: string[] } & DomainSettingsPayload) =>
    request<{ inserted: Domain[]; skipped: string[] }>("/domains", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  uploadDomains: (
    file: File,
    options?: DomainSettingsPayload,
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (options) {
      Object.entries(options).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });
    }
    return request<{ inserted: Domain[]; skipped: string[] }>("/domains/upload", {
      method: "POST",
      body: formData,
    });
  },
  updateDomain: (id: number, payload: Record<string, unknown>) =>
    request<Domain>(`/domains/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteDomain: (id: number) => request<{ detail: string }>(`/domains/${id}`, { method: "DELETE" }),
  getLogs: (limit = 200) => request<LogEntry[]>(`/domains/logs?limit=${limit}`),
  getMonitoringHealth: () => request<MonitoringHealth>("/health/monitoring"),
  getProxies: () => request<ProxyEntry[]>("/proxies"),
  createProxy: (proxy_url: string) =>
    request<ProxyEntry>("/proxies", {
      method: "POST",
      body: JSON.stringify({ proxy_url }),
    }),
  deleteProxy: (id: number) => request<{ detail: string }>(`/proxies/${id}`, { method: "DELETE" }),
  getAdminUsers: (statusFilter?: string, includeDeleted = false) =>
    request<AdminUser[]>(
      `/admin/users?${new URLSearchParams({
        ...(statusFilter ? { status_filter: statusFilter } : {}),
        ...(includeDeleted ? { include_deleted: "true" } : {}),
      }).toString()}`,
    ),
  createAdminUser: (payload: Record<string, unknown>) =>
    request<User>("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAdminUser: (id: number, payload: Record<string, unknown>) =>
    request<User>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  grantAccess: (id: number, duration_seconds: number) =>
    request<User>(`/admin/users/${id}/grant-access`, {
      method: "POST",
      body: JSON.stringify({ duration_seconds }),
    }),
  softDeleteUser: (id: number) =>
    request<User>(`/admin/users/${id}/soft-delete`, { method: "POST" }),
  restoreUser: (id: number) =>
    request<User>(`/admin/users/${id}/restore`, { method: "POST" }),
  hardDeleteUser: (id: number) =>
    request<{ detail: string }>(`/admin/users/${id}`, { method: "DELETE" }),
  getPromoCodes: () => request<PromoCode[]>("/admin/promo-codes"),
  createPromoCode: (payload: Record<string, unknown>) =>
    request<PromoCode>("/admin/promo-codes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAuditLogs: () => request<AuditLog[]>("/admin/audit-logs?limit=50"),
  getDiagnosticTelegram: () => request<DiagnosticTelegramSettings>("/admin/diagnostic-telegram"),
  updateDiagnosticTelegram: (payload: DiagnosticTelegramSettings) =>
    request<DiagnosticTelegramSettings>("/admin/diagnostic-telegram", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  testDiagnosticTelegram: () => request<{ detail: string }>("/admin/diagnostic-telegram/test", { method: "POST" }),
};
