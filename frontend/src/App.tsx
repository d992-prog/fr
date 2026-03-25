import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

import {
  AdminUser,
  AuditLog,
  Domain,
  DomainSettingsPayload,
  LogEntry,
  MonitoringHealth,
  MonitoringHealthItem,
  PromoCode,
  ProxyEntry,
  SessionResponse,
  api,
} from "./api";

type Toast = { type: "success" | "error"; text: string } | null;
type Language = "ru" | "en";
type View = "dashboard" | "profile" | "admin";
type DomainTab = "all" | "checking" | "available" | "captured" | "error" | "inactive";

type DomainDraft = {
  scheduler_mode: "continuous" | "pattern";
  check_interval: string;
  burst_check_interval: string;
  confirmation_threshold: string;
  available_recheck_enabled: boolean;
  available_recheck_interval: string;
  pattern_slow_interval: string;
  pattern_fast_interval: string;
  pattern_window_start_minute: string;
  pattern_window_end_minute: string;
};

type UserDraft = {
  status: string;
  role: string;
  language: string;
  maxDomains: string;
  statusMessage: string;
};

const DEFAULT_NEW_DOMAIN_SETTINGS: DomainDraft = {
  scheduler_mode: "pattern",
  check_interval: "1.5",
  burst_check_interval: "0.35",
  confirmation_threshold: "3",
  available_recheck_enabled: false,
  available_recheck_interval: "1800",
  pattern_slow_interval: "60",
  pattern_fast_interval: "0.5",
  pattern_window_start_minute: "31",
  pattern_window_end_minute: "34",
};

const ACCESS_PRESETS = [
  { label: "1d", seconds: 86_400 },
  { label: "7d", seconds: 7 * 86_400 },
  { label: "30d", seconds: 30 * 86_400 },
  { label: "90d", seconds: 90 * 86_400 },
  { label: "180d", seconds: 180 * 86_400 },
  { label: "365d", seconds: 365 * 86_400 },
];

const STATUS_CLASS: Record<string, string> = {
  available: "status available",
  captured: "status danger",
  checking: "status checking",
  error: "status error",
  inactive: "status inactive",
  dead: "status error",
  pending: "status inactive",
  approved: "status available",
  blocked: "status error",
  rejected: "status error",
  info: "status checking",
  "pattern-fast": "status checking",
  "pattern-slow": "status inactive",
  "available-watch": "status available",
  "available-stop": "status inactive",
  normal: "status checking",
  burst: "status checking",
  continuous: "status checking",
  pattern: "status inactive",
};

function loadStoredLanguage(): Language {
  if (typeof window === "undefined") {
    return "ru";
  }
  return window.localStorage.getItem("frdm_language") === "en" ? "en" : "ru";
}

function formatPreciseDate(value: string | null, language: Language) {
  if (!value) {
    return language === "ru" ? "Нет данных" : "No data";
  }
  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).format(new Date(value));
}

function formatRemaining(value: string | null, language: Language) {
  if (!value) {
    return language === "ru" ? "Не выдано" : "Not granted";
  }
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) {
    return language === "ru" ? "Истекло" : "Expired";
  }
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    return language === "ru" ? `${days} д.` : `${days} d`;
  }
  return language === "ru" ? `${hours} ч.` : `${hours} h`;
}

function formatSeconds(seconds: number, language: Language, approximate = false) {
  const prefix = approximate ? "~" : "";
  if (seconds >= 60 && Number.isInteger(seconds / 60)) {
    return language === "ru" ? `${prefix}${seconds / 60} мин` : `${prefix}${seconds / 60} min`;
  }
  if (seconds >= 10) {
    return `${prefix}${seconds.toFixed(0)} s`;
  }
  if (seconds >= 1) {
    return `${prefix}${seconds.toFixed(1)} s`;
  }
  return `${prefix}${seconds.toFixed(2)} s`;
}

function schedulerModeLabel(mode: string, language: Language) {
  const map: Record<string, { ru: string; en: string }> = {
    continuous: { ru: "Постоянный режим", en: "Continuous mode" },
    pattern: { ru: "Режим по окну дропа", en: "Drop-window mode" },
  };
  const label = map[mode];
  return label ? (language === "ru" ? label.ru : label.en) : mode;
}

function runtimeModeLabel(mode: string, language: Language) {
  const map: Record<string, { ru: string; en: string }> = {
    normal: { ru: "Обычный цикл", en: "Normal cycle" },
    burst: { ru: "Burst / ускоренный цикл", en: "Burst / accelerated cycle" },
    "pattern-slow": { ru: "Вне окна дропа", en: "Outside drop window" },
    "pattern-fast": { ru: "Внутри окна дропа", en: "Inside drop window" },
    "available-watch": { ru: "Медленное наблюдение после освобождения", en: "Slow post-release watch" },
    "available-stop": { ru: "Остановлен после подтверждения доступности", en: "Stopped after availability" },
  };
  const label = map[mode];
  return label ? (language === "ru" ? label.ru : label.en) : mode;
}

function statusLabel(status: string, language: Language) {
  const map: Record<string, { ru: string; en: string }> = {
    available: { ru: "Доступен", en: "Available" },
    captured: { ru: "Перехвачен повторно", en: "Captured again" },
    checking: { ru: "Проверяется", en: "Checking" },
    error: { ru: "Есть ошибка", en: "Has error" },
    inactive: { ru: "Остановлен", en: "Stopped" },
    dead: { ru: "Недоступен", en: "Dead" },
    pending: { ru: "Ожидает одобрения", en: "Pending" },
    approved: { ru: "Одобрен", en: "Approved" },
    blocked: { ru: "Заблокирован", en: "Blocked" },
    rejected: { ru: "Отклонен", en: "Rejected" },
    info: { ru: "Инфо", en: "Info" },
  };
  const label = map[status];
  return label ? (language === "ru" ? label.ru : label.en) : status;
}

function domainDraftFromDomain(domain: Domain): DomainDraft {
  return {
    scheduler_mode: domain.scheduler_mode === "pattern" ? "pattern" : "continuous",
    check_interval: String(domain.check_interval),
    burst_check_interval: String(domain.burst_check_interval),
    confirmation_threshold: String(domain.confirmation_threshold),
    available_recheck_enabled: domain.available_recheck_enabled,
    available_recheck_interval: String(domain.available_recheck_interval),
    pattern_slow_interval: String(domain.pattern_slow_interval),
    pattern_fast_interval: String(domain.pattern_fast_interval),
    pattern_window_start_minute: String(domain.pattern_window_start_minute),
    pattern_window_end_minute: String(domain.pattern_window_end_minute),
  };
}

function buildUserDrafts(users: AdminUser[]) {
  return Object.fromEntries(
    users.map((user) => [
      user.id,
      {
        status: user.status,
        role: user.role,
        language: user.language,
        maxDomains: user.max_domains?.toString() ?? "",
        statusMessage: user.status_message ?? "",
      },
    ]),
  ) as Record<number, UserDraft>;
}

function parseNumericInput(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  return Number(normalized);
}

function payloadFromDraft(draft: DomainDraft): DomainSettingsPayload {
  return {
    scheduler_mode: draft.scheduler_mode,
    check_interval: parseNumericInput(draft.check_interval),
    burst_check_interval: parseNumericInput(draft.burst_check_interval),
    confirmation_threshold: parseNumericInput(draft.confirmation_threshold),
    available_recheck_enabled: draft.available_recheck_enabled,
    available_recheck_interval: parseNumericInput(draft.available_recheck_interval),
    pattern_slow_interval: parseNumericInput(draft.pattern_slow_interval),
    pattern_fast_interval: parseNumericInput(draft.pattern_fast_interval),
    pattern_window_start_minute: parseNumericInput(draft.pattern_window_start_minute),
    pattern_window_end_minute: parseNumericInput(draft.pattern_window_end_minute),
  };
}

function isDomainInTab(domain: Domain, tab: DomainTab) {
  switch (tab) {
    case "checking":
      return domain.status === "checking";
    case "available":
      return domain.status === "available";
    case "captured":
      return domain.status === "captured";
    case "error":
      return domain.status === "error";
    case "inactive":
      return domain.status === "inactive";
    default:
      return true;
  }
}

function currentInterval(domain: Domain) {
  switch (domain.check_mode) {
    case "burst":
      return { seconds: domain.burst_check_interval, approximate: false };
    case "pattern-fast":
      return { seconds: domain.pattern_fast_interval, approximate: false };
    case "pattern-slow":
      return { seconds: domain.pattern_slow_interval, approximate: true };
    case "available-watch":
    case "available-stop":
      return { seconds: domain.available_recheck_interval, approximate: false };
    default:
      return { seconds: domain.check_interval, approximate: false };
  }
}

function healthById(items: MonitoringHealthItem[] | undefined) {
  return new Map((items ?? []).map((item) => [item.domain_id, item]));
}

export default function App() {
  const [language, setLanguage] = useState<Language>(loadStoredLanguage);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [view, setView] = useState<View>("dashboard");
  const [domainTab, setDomainTab] = useState<DomainTab>("all");

  const [domains, setDomains] = useState<Domain[]>([]);
  const [proxies, setProxies] = useState<ProxyEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [monitoringHealth, setMonitoringHealth] = useState<MonitoringHealth | null>(null);
  const [domainDrafts, setDomainDrafts] = useState<Record<number, DomainDraft>>({});

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [userDrafts, setUserDrafts] = useState<Record<number, UserDraft>>({});
  const [adminStatusFilter, setAdminStatusFilter] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: "", password: "", remember_me: true });
  const [registerForm, setRegisterForm] = useState({ username: "", password: "" });
  const [singleDomain, setSingleDomain] = useState("");
  const [bulkDomains, setBulkDomains] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [newDomainSettings, setNewDomainSettings] = useState<DomainDraft>(DEFAULT_NEW_DOMAIN_SETTINGS);
  const [promoInput, setPromoInput] = useState("");
  const [telegramForm, setTelegramForm] = useState({ telegram_token: "", telegram_chat_id: "" });
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "" });
  const [manualUserForm, setManualUserForm] = useState({
    username: "",
    password: "",
    role: "user",
    status: "approved",
    language: "ru",
    maxDomains: "",
  });
  const [promoForm, setPromoForm] = useState({
    code: "",
    durationDays: "30",
    maxActivations: "",
    expiresAt: "",
    isActive: true,
  });

  const l = (ru: string, en: string) => (language === "ru" ? ru : en);
  const isAdmin = session?.user.role === "owner" || session?.user.role === "admin";
  const canUseFeatures = session?.has_feature_access ?? false;
  const activeCount = useMemo(() => domains.filter((item) => item.is_active).length, [domains]);
  const availableCount = useMemo(() => domains.filter((item) => item.status === "available").length, [domains]);
  const capturedCount = useMemo(() => domains.filter((item) => item.status === "captured").length, [domains]);
  const domainHealth = useMemo(() => healthById(monitoringHealth?.items), [monitoringHealth?.items]);

  const filteredDomains = useMemo(
    () => domains.filter((domain) => isDomainInTab(domain, domainTab)),
    [domainTab, domains],
  );

  const tabCounts = useMemo(
    () => ({
      all: domains.length,
      checking: domains.filter((item) => item.status === "checking").length,
      available: domains.filter((item) => item.status === "available").length,
      captured: domains.filter((item) => item.status === "captured").length,
      error: domains.filter((item) => item.status === "error").length,
      inactive: domains.filter((item) => item.status === "inactive").length,
    }),
    [domains],
  );

  const userMessage = useMemo(() => {
    if (!session || session.has_feature_access) {
      return "";
    }
    if (session.user.status_message) {
      return session.user.status_message;
    }
    if (session.user.status === "pending") {
      return l(
        "Ваша учетная запись ждет одобрения администратора. Вы уже можете войти, но запускать мониторинг нельзя до одобрения или активации промокода.",
        "Your account is waiting for admin approval. You can sign in already, but monitoring stays locked until approval or promo activation.",
      );
    }
    if (session.user.status === "blocked") {
      return l(
        "Аккаунт заблокирован. Все домены пользователя остановлены.",
        "Your account is blocked. All user workers are stopped.",
      );
    }
    if (session.user.status === "rejected") {
      return l(
        "Регистрация отклонена. Можно запросить доступ у администратора или активировать промокод.",
        "Registration was rejected. Ask the admin for access or activate a promo code.",
      );
    }
    return l(
      "Время доступа истекло. Действия в панели заблокированы, пока администратор не продлит доступ или пока вы не активируете промокод.",
      "Access time expired. Actions are locked until the admin extends access or you activate a promo code.",
    );
  }, [language, session]);

  useEffect(() => {
    window.localStorage.setItem("frdm_language", language);
  }, [language]);

  useEffect(() => {
    let mounted = true;
    api
      .getSession()
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setSession(payload);
        if (!window.localStorage.getItem("frdm_language")) {
          setLanguage(payload.user.language === "en" ? "en" : "ru");
        }
        setTelegramForm({
          telegram_token: payload.user.telegram_token ?? "",
          telegram_chat_id: payload.user.telegram_chat_id ?? "",
        });
      })
      .catch(() => {
        if (mounted) {
          setSession(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setAuthLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setDomains([]);
      setProxies([]);
      setLogs([]);
      setMonitoringHealth(null);
      return;
    }

    let ignore = false;
    const load = async () => {
      try {
        const [domainData, proxyData, logData, healthData] = await Promise.all([
          api.getDomains(),
          api.getProxies(),
          api.getLogs(),
          api.getMonitoringHealth(),
        ]);
        if (ignore) {
          return;
        }
        setDomains(domainData);
        setProxies(proxyData);
        setLogs(logData);
        setMonitoringHealth(healthData);
      } catch (error) {
        if (!ignore) {
          setToast({
            type: "error",
            text: error instanceof Error ? error.message : l("Не удалось загрузить данные панели", "Failed to load dashboard"),
          });
        }
      }
    };

    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [language, session?.user.id]);

  useEffect(() => {
    if (!session || !isAdmin || view !== "admin") {
      return;
    }
    void loadAdmin();
  }, [adminStatusFilter, includeDeleted, isAdmin, session?.user.id, view]);

  useEffect(() => {
    setDomainDrafts((current) => {
      const next: Record<number, DomainDraft> = {};
      for (const domain of domains) {
        next[domain.id] = current[domain.id] ?? domainDraftFromDomain(domain);
      }
      return next;
    });
  }, [domains]);

  async function loadAdmin() {
    const [users, promo, audit] = await Promise.all([
      api.getAdminUsers(adminStatusFilter || undefined, includeDeleted),
      api.getPromoCodes(),
      api.getAuditLogs(),
    ]);
    setAdminUsers(users);
    setPromoCodes(promo);
    setAuditLogs(audit);
    setUserDrafts(buildUserDrafts(users));
  }

  async function refreshDashboard() {
    const [domainData, proxyData, logData, healthData] = await Promise.all([
      api.getDomains(),
      api.getProxies(),
      api.getLogs(),
      api.getMonitoringHealth(),
    ]);
    setDomains(domainData);
    setProxies(proxyData);
    setLogs(logData);
    setMonitoringHealth(healthData);
  }

  function syncSession(payload: SessionResponse) {
    setSession(payload);
    setTelegramForm({
      telegram_token: payload.user.telegram_token ?? "",
      telegram_chat_id: payload.user.telegram_chat_id ?? "",
    });
  }

  async function runAction(action: () => Promise<void>, successText: string) {
    try {
      await action();
      setToast({ type: "success", text: successText });
    } catch (error) {
      setToast({
        type: "error",
        text: error instanceof Error ? error.message : l("Запрос завершился ошибкой", "Request failed"),
      });
    }
  }

  function updateNewDomainSettings<K extends keyof DomainDraft>(key: K, value: DomainDraft[K]) {
    setNewDomainSettings((current) => ({ ...current, [key]: value }));
  }

  function updateDomainDraft<K extends keyof DomainDraft>(domainId: number, key: K, value: DomainDraft[K]) {
    setDomainDrafts((current) => ({
      ...current,
      [domainId]: {
        ...(current[domainId] ?? DEFAULT_NEW_DOMAIN_SETTINGS),
        [key]: value,
      },
    }));
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const payload = await api.login(loginForm);
      syncSession(payload);
    }, l("Вход выполнен", "Signed in"));
  }

  async function submitRegister(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const payload = await api.register({
        username: registerForm.username,
        password: registerForm.password,
        language,
      });
      syncSession(payload);
    }, l("Аккаунт создан", "Account created"));
  }

  async function logout() {
    await runAction(async () => {
      await api.logout();
      setSession(null);
      setView("dashboard");
    }, l("Вы вышли из аккаунта", "Logged out"));
  }

  async function submitSingleDomain(event: FormEvent) {
    event.preventDefault();
    if (!singleDomain.trim()) {
      return;
    }
    await runAction(async () => {
      const result = await api.createDomain({
        domain: singleDomain.trim(),
        ...payloadFromDraft(newDomainSettings),
      });
      setSingleDomain("");
      await refreshDashboard();
      if (result.skipped.length) {
        throw new Error(result.skipped.join(", "));
      }
    }, l("Домен добавлен", "Domain added"));
  }

  async function submitBulkDomains(event: FormEvent) {
    event.preventDefault();
    const list = bulkDomains
      .split(/\r?\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!list.length) {
      return;
    }
    await runAction(async () => {
      await api.createBulkDomains({
        domains: list,
        ...payloadFromDraft(newDomainSettings),
      });
      setBulkDomains("");
      await refreshDashboard();
    }, l("Список доменов импортирован", "Domain list imported"));
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      return;
    }
    await runAction(async () => {
      await api.uploadDomains(file, payloadFromDraft(newDomainSettings));
      setFile(null);
      const input = document.getElementById("domain-file") as HTMLInputElement | null;
      if (input) {
        input.value = "";
      }
      await refreshDashboard();
    }, l("Файл обработан", "File processed"));
  }

  async function submitProxy(event: FormEvent) {
    event.preventDefault();
    if (!proxyUrl.trim()) {
      return;
    }
    await runAction(async () => {
      await api.createProxy(proxyUrl.trim());
      setProxyUrl("");
      await refreshDashboard();
    }, l("Прокси добавлен", "Proxy added"));
  }

  async function updateDomain(domainId: number, payload: Record<string, unknown>, successText: string) {
    await runAction(async () => {
      await api.updateDomain(domainId, payload);
      await refreshDashboard();
    }, successText);
  }

  async function applyDomainSettings(domain: Domain) {
    const draft = domainDrafts[domain.id];
    if (!draft) {
      return;
    }
    await updateDomain(
      domain.id,
      payloadFromDraft(draft),
      l(`Настройки домена ${domain.domain} применены`, `Settings saved for ${domain.domain}`),
    );
  }

  function resetDomainSettings(domain: Domain) {
    setDomainDrafts((current) => ({
      ...current,
      [domain.id]: domainDraftFromDomain(domain),
    }));
    setToast({
      type: "success",
      text: l(`Черновик настроек для ${domain.domain} сброшен`, `Draft reset for ${domain.domain}`),
    });
  }

  async function toggleDomain(domain: Domain) {
    await updateDomain(
      domain.id,
      { is_active: !domain.is_active },
      domain.is_active
        ? l(`Мониторинг ${domain.domain} остановлен`, `Monitoring paused for ${domain.domain}`)
        : l(`Мониторинг ${domain.domain} возобновлен`, `Monitoring resumed for ${domain.domain}`),
    );
  }

  async function switchSchedulerMode(domain: Domain, scheduler_mode: "continuous" | "pattern") {
    await updateDomain(
      domain.id,
      { scheduler_mode },
      scheduler_mode === "continuous"
        ? l(`Для ${domain.domain} включен постоянный режим`, `Continuous mode enabled for ${domain.domain}`)
        : l(`Для ${domain.domain} включен режим по окну дропа`, `Drop-window mode enabled for ${domain.domain}`),
    );
  }

  async function toggleManualBurst(domain: Domain) {
    await updateDomain(
      domain.id,
      { manual_burst: !domain.manual_burst },
      domain.manual_burst
        ? l(`Ручной burst для ${domain.domain} отключен`, `Manual burst disabled for ${domain.domain}`)
        : l(`Ручной burst для ${domain.domain} включен`, `Manual burst enabled for ${domain.domain}`),
    );
  }

  async function toggleAvailableRecheck(domain: Domain) {
    const enabled = !domain.available_recheck_enabled;
    await updateDomain(
      domain.id,
      { available_recheck_enabled: enabled, is_active: enabled },
      enabled
        ? l(`Для ${domain.domain} включено медленное наблюдение после освобождения`, `Slow recheck enabled for ${domain.domain}`)
        : l(`Для ${domain.domain} остановлено медленное наблюдение`, `Slow recheck disabled for ${domain.domain}`),
    );
  }

  async function removeDomain(domainId: number) {
    await runAction(async () => {
      await api.deleteDomain(domainId);
      await refreshDashboard();
    }, l("Домен удален", "Domain deleted"));
  }

  async function removeProxy(proxyId: number) {
    await runAction(async () => {
      await api.deleteProxy(proxyId);
      await refreshDashboard();
    }, l("Прокси удален", "Proxy deleted"));
  }

  async function submitPromo(event: FormEvent) {
    event.preventDefault();
    if (!promoInput.trim()) {
      return;
    }
    await runAction(async () => {
      const payload = await api.applyPromo(promoInput.trim());
      syncSession(payload);
      setPromoInput("");
      await refreshDashboard();
    }, l("Промокод активирован", "Promo code applied"));
  }

  async function saveTelegram(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const payload = await api.updateTelegram(telegramForm);
      syncSession(payload);
    }, l("Данные Telegram сохранены", "Telegram settings saved"));
  }

  async function testTelegram() {
    await runAction(async () => {
      await api.testTelegram();
    }, l("Тестовое уведомление отправлено", "Test notification sent"));
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const payload = await api.changePassword(passwordForm);
      syncSession(payload);
      setPasswordForm({ current_password: "", new_password: "" });
    }, l("Пароль обновлен", "Password updated"));
  }

  async function submitManualUser(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      await api.createAdminUser({
        username: manualUserForm.username,
        password: manualUserForm.password,
        role: manualUserForm.role,
        status: manualUserForm.status,
        language: manualUserForm.language,
        max_domains: manualUserForm.maxDomains ? Number(manualUserForm.maxDomains) : null,
      });
      setManualUserForm({
        username: "",
        password: "",
        role: "user",
        status: "approved",
        language: "ru",
        maxDomains: "",
      });
      await loadAdmin();
    }, l("Пользователь создан", "User created"));
  }

  async function saveAdminUser(userId: number) {
    const draft = userDrafts[userId];
    if (!draft) {
      return;
    }
    await runAction(async () => {
      await api.updateAdminUser(userId, {
        status: draft.status,
        role: draft.role,
        language: draft.language,
        status_message: draft.statusMessage || null,
        max_domains: draft.maxDomains ? Number(draft.maxDomains) : null,
      });
      await loadAdmin();
    }, l("Параметры пользователя сохранены", "User updated"));
  }

  async function grantUserAccess(userId: number, durationSeconds: number) {
    await runAction(async () => {
      await api.grantAccess(userId, durationSeconds);
      await loadAdmin();
    }, l("Доступ продлен", "Access granted"));
  }

  async function softDeleteUser(userId: number) {
    await runAction(async () => {
      await api.softDeleteUser(userId);
      await loadAdmin();
    }, l("Пользователь мягко удален", "User soft-deleted"));
  }

  async function restoreUser(userId: number) {
    await runAction(async () => {
      await api.restoreUser(userId);
      await loadAdmin();
    }, l("Пользователь восстановлен", "User restored"));
  }

  async function hardDeleteUser(userId: number) {
    if (!window.confirm(l("Удалить пользователя из системы полностью?", "Delete this user permanently?"))) {
      return;
    }
    await runAction(async () => {
      await api.hardDeleteUser(userId);
      await loadAdmin();
    }, l("Пользователь удален навсегда", "User permanently deleted"));
  }

  async function submitPromoCode(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      await api.createPromoCode({
        code: promoForm.code,
        duration_seconds: Math.round(Number(promoForm.durationDays) * 86_400),
        max_activations: promoForm.maxActivations ? Number(promoForm.maxActivations) : null,
        expires_at: promoForm.expiresAt ? new Date(promoForm.expiresAt).toISOString() : null,
        is_active: promoForm.isActive,
      });
      setPromoForm({
        code: "",
        durationDays: "30",
        maxActivations: "",
        expiresAt: "",
        isActive: true,
      });
      await loadAdmin();
    }, l("Промокод создан", "Promo code created"));
  }

  function renderField(
    labelRu: string,
    labelEn: string,
    control: ReactNode,
    hintRu?: string,
    hintEn?: string,
  ) {
    return (
      <label className="field">
        <span className="field-label">{l(labelRu, labelEn)}</span>
        {control}
        {hintRu || hintEn ? <span className="field-hint">{l(hintRu ?? "", hintEn ?? "")}</span> : null}
      </label>
    );
  }

  function renderDomainSettingsEditor(domain: Domain) {
    const draft = domainDrafts[domain.id] ?? domainDraftFromDomain(domain);
    return (
      <div className="domain-settings">
        <div className="card-head compact-head">
          <div>
            <h3>{l("Настройки этого домена", "This domain settings")}</h3>
            <span className="muted">
              {l(
                "Этот блок меняет только текущий домен. Значения из правой панели добавления новых доменов сюда не применяются автоматически.",
                "This editor affects only the current domain. Values from the new-domain panel do not apply here automatically.",
              )}
            </span>
          </div>
        </div>
        <div className="form two-columns">
          {renderField(
            "Стратегия мониторинга",
            "Monitoring strategy",
            <select
              value={draft.scheduler_mode}
              onChange={(event) => updateDomainDraft(domain.id, "scheduler_mode", event.target.value as "continuous" | "pattern")}
            >
              <option value="continuous">{l("Постоянный режим", "Continuous mode")}</option>
              <option value="pattern">{l("Режим по окну дропа", "Drop-window mode")}</option>
            </select>,
            "Постоянный режим всегда использует базовый интервал. Режим по окну дропа работает медленно вне окна и быстро внутри окна.",
            "Continuous mode always uses the base interval. Drop-window mode runs slowly outside the window and quickly inside it.",
          )}
          {renderField(
            "Подтверждений до статуса Доступен",
            "Confirmations before Available",
            <input
              value={draft.confirmation_threshold}
              onChange={(event) => updateDomainDraft(domain.id, "confirmation_threshold", event.target.value)}
            />,
            "Сколько подряд совпадений DNS + RDAP нужно до статуса Доступен.",
            "How many consecutive DNS + RDAP matches are required before the domain becomes Available.",
          )}
          {renderField(
            "Базовый интервал, сек",
            "Base interval, sec",
            <input value={draft.check_interval} onChange={(event) => updateDomainDraft(domain.id, "check_interval", event.target.value)} />,
          )}
          {renderField(
            "Burst интервал, сек",
            "Burst interval, sec",
            <input
              value={draft.burst_check_interval}
              onChange={(event) => updateDomainDraft(domain.id, "burst_check_interval", event.target.value)}
            />,
          )}
          {renderField(
            "Интервал вне окна, сек",
            "Outside window interval, sec",
            <input
              value={draft.pattern_slow_interval}
              onChange={(event) => updateDomainDraft(domain.id, "pattern_slow_interval", event.target.value)}
            />,
            "Движок сам добавляет небольшой разброс, чтобы большие пачки доменов не били в одну секунду.",
            "The engine adds a slight spread so large domain sets do not hit at the exact same second.",
          )}
          {renderField(
            "Интервал внутри окна, сек",
            "Inside window interval, sec",
            <input
              value={draft.pattern_fast_interval}
              onChange={(event) => updateDomainDraft(domain.id, "pattern_fast_interval", event.target.value)}
            />,
          )}
          {renderField(
            "Старт окна, минута часа",
            "Window start minute",
            <input
              value={draft.pattern_window_start_minute}
              onChange={(event) => updateDomainDraft(domain.id, "pattern_window_start_minute", event.target.value)}
            />,
          )}
          {renderField(
            "Конец окна, минута часа",
            "Window end minute",
            <input
              value={draft.pattern_window_end_minute}
              onChange={(event) => updateDomainDraft(domain.id, "pattern_window_end_minute", event.target.value)}
            />,
          )}
          {renderField(
            "Наблюдение после освобождения",
            "Observe after availability",
            <label className="switch-line">
              <input
                type="checkbox"
                checked={draft.available_recheck_enabled}
                onChange={(event) => updateDomainDraft(domain.id, "available_recheck_enabled", event.target.checked)}
              />
              <span>
                {draft.available_recheck_enabled
                  ? l("Да, продолжать редкие проверки после доступности", "Yes, continue slow checks after availability")
                  : l("Нет, останавливать домен после подтверждения доступности", "No, stop this domain after availability")}
              </span>
            </label>,
          )}
          {renderField(
            "Интервал наблюдения после освобождения, сек",
            "Post-availability recheck interval, sec",
            <input
              value={draft.available_recheck_interval}
              onChange={(event) => updateDomainDraft(domain.id, "available_recheck_interval", event.target.value)}
            />,
            "Например 1800 секунд = 30 минут.",
            "For example, 1800 seconds = 30 minutes.",
          )}
        </div>
        <div className="actions">
          <button type="button" onClick={() => void applyDomainSettings(domain)} disabled={!canUseFeatures}>
            {l("Применить настройки", "Apply settings")}
          </button>
          <button type="button" className="ghost" onClick={() => resetDomainSettings(domain)}>
            {l("Сбросить черновик", "Reset draft")}
          </button>
        </div>
      </div>
    );
  }

  function renderDomainCard(domain: Domain) {
    const health = domainHealth.get(domain.id);
    const interval = currentInterval(domain);

    return (
      <article key={domain.id} className="domain-card card">
        <div className="domain-card-head">
          <div>
            <div className="domain-title-row">
              <h3>{domain.domain}</h3>
              <span className={STATUS_CLASS[domain.status] ?? "status"}>{statusLabel(domain.status, language)}</span>
              <span className={STATUS_CLASS[domain.check_mode] ?? "status"}>{runtimeModeLabel(domain.check_mode, language)}</span>
              <span className={STATUS_CLASS[domain.scheduler_mode] ?? "status"}>{schedulerModeLabel(domain.scheduler_mode, language)}</span>
              {health?.is_stale ? <span className="status error">{l("Воркер застыл", "Worker is stale")}</span> : null}
            </div>
            <p className="muted domain-explainer">
              {l(
                "В карточке отдельно видно: стратегия домена, текущий runtime-режим, реально применяемый интервал и черновик настроек, который вступит в силу только после кнопки Применить настройки.",
                "This card separates the domain strategy, current runtime mode, actually applied interval, and the draft settings that only take effect after Apply settings.",
              )}
            </p>
          </div>

          <div className="actions wrap">
            <button type="button" onClick={() => void toggleDomain(domain)} disabled={!canUseFeatures}>
              {domain.is_active ? l("Остановить мониторинг", "Pause monitoring") : l("Возобновить мониторинг", "Resume monitoring")}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void switchSchedulerMode(domain, "continuous")}
              disabled={!canUseFeatures || domain.scheduler_mode === "continuous"}
            >
              {l("Переключить на постоянный режим", "Switch to continuous")}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void switchSchedulerMode(domain, "pattern")}
              disabled={!canUseFeatures || domain.scheduler_mode === "pattern"}
            >
              {l("Переключить на режим по окну", "Switch to drop-window")}
            </button>
            <button type="button" className="ghost" onClick={() => void toggleManualBurst(domain)} disabled={!canUseFeatures}>
              {domain.manual_burst ? l("Отключить ручной burst", "Disable manual burst") : l("Включить ручной burst", "Enable manual burst")}
            </button>
            {domain.status === "available" ? (
              <button type="button" className="ghost" onClick={() => void toggleAvailableRecheck(domain)} disabled={!canUseFeatures}>
                {domain.available_recheck_enabled
                  ? l("Остановить медленное наблюдение", "Stop slow recheck")
                  : l("Включить медленное наблюдение", "Enable slow recheck")}
              </button>
            ) : null}
            <button type="button" className="danger" onClick={() => void removeDomain(domain.id)} disabled={!canUseFeatures}>
              {l("Удалить домен", "Delete domain")}
            </button>
          </div>
        </div>

        <div className="domain-metrics">
          <div>
            <span>{l("Что применяется сейчас", "Applied right now")}</span>
            <strong>{formatSeconds(interval.seconds, language, interval.approximate)}</strong>
          </div>
          <div>
            <span>{l("Стратегия домена", "Domain strategy")}</span>
            <strong>{schedulerModeLabel(domain.scheduler_mode, language)}</strong>
          </div>
          <div>
            <span>{l("Текущий runtime-режим", "Current runtime mode")}</span>
            <strong>{runtimeModeLabel(domain.check_mode, language)}</strong>
          </div>
          <div>
            <span>{l("Подтверждения", "Confirmations")}</span>
            <strong>
              {domain.available_confirmations} / {domain.confirmation_threshold}
            </strong>
          </div>
          <div>
            <span>{l("Последняя проверка", "Last check")}</span>
            <strong>{formatPreciseDate(domain.last_check_at, language)}</strong>
          </div>
          <div>
            <span>{l("Heartbeat воркера", "Worker heartbeat")}</span>
            <strong>{formatPreciseDate(domain.worker_heartbeat_at, language)}</strong>
          </div>
          <div>
            <span>{l("Подтвержден как доступный", "Confirmed available at")}</span>
            <strong>{formatPreciseDate(domain.available_at, language)}</strong>
          </div>
          <div>
            <span>{l("Последняя смена владельца", "Last owner change")}</span>
            <strong>{formatPreciseDate(domain.last_owner_change_at, language)}</strong>
          </div>
        </div>

        <div className="domain-snapshot-grid">
          <div className="snapshot-box">
            <span>{l("Последний RDAP статус", "Last RDAP status")}</span>
            <strong>{domain.last_seen_rdap_status ?? l("Нет данных", "No data")}</strong>
          </div>
          <div className="snapshot-box">
            <span>{l("Последний владелец", "Last seen owner")}</span>
            <strong>{domain.last_seen_owner ?? l("Нет данных", "No data")}</strong>
          </div>
          <div className="snapshot-box">
            <span>{l("После доступности", "After availability")}</span>
            <strong>
              {domain.available_recheck_enabled
                ? l("Будет медленное наблюдение", "Will continue slow recheck")
                : l("Мониторинг будет остановлен", "Monitoring will stop")}
            </strong>
          </div>
          <div className="snapshot-box">
            <span>{l("Интервал наблюдения после освобождения", "Post-availability interval")}</span>
            <strong>{formatSeconds(domain.available_recheck_interval, language)}</strong>
          </div>
        </div>

        {domain.last_error ? <div className="inline-alert error">{domain.last_error}</div> : null}
        {health?.is_stale ? (
          <div className="inline-alert error">
            {l(
              "Этот домен отмечен как застывший. Watchdog должен перезапустить его автоматически, но карточка уже показывает проблему явно.",
              "This domain is marked as stale. The watchdog should restart it automatically, but the problem is also shown here explicitly.",
            )}
          </div>
        ) : null}

        {renderDomainSettingsEditor(domain)}
      </article>
    );
  }

  function renderNewDomainSettings() {
    return (
      <div className="card">
        <div className="card-head">
          <div>
            <h2>{l("Параметры для новых доменов", "Defaults for new domains")}</h2>
            <span className="muted">
              {l(
                "Этот блок влияет только на домены, которые будут добавлены после этого. Уже существующие домены меняются только в своей карточке после кнопки Применить настройки.",
                "This block affects only domains that will be added after this. Existing domains change only inside their own card after Apply settings.",
              )}
            </span>
          </div>
        </div>
        <div className="form two-columns">
          {renderField(
            "Стратегия для новых доменов",
            "Strategy for new domains",
            <select
              value={newDomainSettings.scheduler_mode}
              onChange={(event) => updateNewDomainSettings("scheduler_mode", event.target.value as "continuous" | "pattern")}
            >
              <option value="continuous">{l("Постоянный режим", "Continuous mode")}</option>
              <option value="pattern">{l("Режим по окну дропа", "Drop-window mode")}</option>
            </select>,
          )}
          {renderField(
            "Подтверждений до статуса Доступен",
            "Confirmations before Available",
            <input
              value={newDomainSettings.confirmation_threshold}
              onChange={(event) => updateNewDomainSettings("confirmation_threshold", event.target.value)}
            />,
          )}
          {renderField(
            "Базовый интервал, сек",
            "Base interval, sec",
            <input
              value={newDomainSettings.check_interval}
              onChange={(event) => updateNewDomainSettings("check_interval", event.target.value)}
            />,
          )}
          {renderField(
            "Burst интервал, сек",
            "Burst interval, sec",
            <input
              value={newDomainSettings.burst_check_interval}
              onChange={(event) => updateNewDomainSettings("burst_check_interval", event.target.value)}
            />,
          )}
          {renderField(
            "Интервал вне окна, сек",
            "Outside window interval, sec",
            <input
              value={newDomainSettings.pattern_slow_interval}
              onChange={(event) => updateNewDomainSettings("pattern_slow_interval", event.target.value)}
            />,
          )}
          {renderField(
            "Интервал внутри окна, сек",
            "Inside window interval, sec",
            <input
              value={newDomainSettings.pattern_fast_interval}
              onChange={(event) => updateNewDomainSettings("pattern_fast_interval", event.target.value)}
            />,
          )}
          {renderField(
            "Старт окна, минута часа",
            "Window start minute",
            <input
              value={newDomainSettings.pattern_window_start_minute}
              onChange={(event) => updateNewDomainSettings("pattern_window_start_minute", event.target.value)}
            />,
          )}
          {renderField(
            "Конец окна, минута часа",
            "Window end minute",
            <input
              value={newDomainSettings.pattern_window_end_minute}
              onChange={(event) => updateNewDomainSettings("pattern_window_end_minute", event.target.value)}
            />,
          )}
          {renderField(
            "Наблюдать после освобождения",
            "Observe after availability",
            <label className="switch-line">
              <input
                type="checkbox"
                checked={newDomainSettings.available_recheck_enabled}
                onChange={(event) => updateNewDomainSettings("available_recheck_enabled", event.target.checked)}
              />
              <span>
                {newDomainSettings.available_recheck_enabled
                  ? l("Да, включать редкое наблюдение", "Yes, enable slow recheck")
                  : l("Нет, останавливать после доступности", "No, stop after availability")}
              </span>
            </label>,
          )}
          {renderField(
            "Интервал наблюдения после освобождения, сек",
            "Post-availability recheck interval, sec",
            <input
              value={newDomainSettings.available_recheck_interval}
              onChange={(event) => updateNewDomainSettings("available_recheck_interval", event.target.value)}
            />,
          )}
        </div>
      </div>
    );
  }

  function renderAuth() {
    return (
      <div className="auth-shell">
        <div className="auth-panel intro">
          <div>
            <p className="eyebrow">Real-Time .fr Monitoring</p>
            <h1>FR Domain Drop Monitor</h1>
            <p className="subtitle">
              {l(
                "Мониторинг .fr доменов с окнами дропа, отслеживанием смены владельца, личными Telegram-уведомлениями и админкой доступа.",
                "Multi-user .fr monitoring with drop windows, owner-change tracking, personal Telegram alerts, and access admin tools.",
              )}
            </p>
          </div>
          <div className="lang-toggle">
            <button type="button" className={language === "ru" ? "ghost active-chip" : "ghost"} onClick={() => setLanguage("ru")}>
              RU
            </button>
            <button type="button" className={language === "en" ? "ghost active-chip" : "ghost"} onClick={() => setLanguage("en")}>
              EN
            </button>
          </div>
        </div>

        <div className="auth-grid">
          <section className="auth-panel">
            <h2>{l("Вход", "Login")}</h2>
            <form className="form" onSubmit={submitLogin}>
              {renderField(
                "Логин",
                "Username",
                <input value={loginForm.username} onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))} />,
              )}
              {renderField(
                "Пароль",
                "Password",
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                />,
              )}
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={loginForm.remember_me}
                  onChange={(event) => setLoginForm((current) => ({ ...current, remember_me: event.target.checked }))}
                />
                <span>{l("Запомнить меня", "Remember me")}</span>
              </label>
              <button type="submit">{l("Войти", "Sign in")}</button>
            </form>
          </section>

          <section className="auth-panel">
            <h2>{l("Регистрация", "Register")}</h2>
            <form className="form" onSubmit={submitRegister}>
              {renderField(
                "Логин",
                "Username",
                <input value={registerForm.username} onChange={(event) => setRegisterForm((current) => ({ ...current, username: event.target.value }))} />,
              )}
              {renderField(
                "Пароль",
                "Password",
                <input
                  type="password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
                />,
              )}
              <p className="muted">
                {l(
                  "После регистрации можно войти сразу, но мониторинг будет доступен только после одобрения администратором или активации промокода.",
                  "You can sign in immediately after registration, but monitoring becomes available only after admin approval or promo activation.",
                )}
              </p>
              <button type="submit">{l("Создать аккаунт", "Create account")}</button>
            </form>
          </section>
        </div>

        {toast ? <div className={`toast ${toast.type}`}>{toast.text}</div> : null}
      </div>
    );
  }

  function renderDashboard() {
    return (
      <>
        <section className="grid two">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>{l("Домены", "Domains")}</h2>
                <span className="muted">
                  {l(
                    "Каждая карточка домена показывает: что настроено, что реально применяется сейчас и что произойдет после нажатия кнопок.",
                    "Each domain card shows what is configured, what is actually applied right now, and what will happen after each action button.",
                  )}
                </span>
              </div>
              <button type="button" className="ghost" onClick={() => void refreshDashboard()}>
                {l("Обновить", "Refresh")}
              </button>
            </div>

            <div className="tab-strip domain-tabs">
              {([
                ["all", l("Все", "All")],
                ["checking", l("Проверяются", "Checking")],
                ["available", l("Доступны", "Available")],
                ["captured", l("Перехвачены", "Captured")],
                ["error", l("Ошибки", "Errors")],
                ["inactive", l("Остановлены", "Stopped")],
              ] as Array<[DomainTab, string]>).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  className={domainTab === tab ? "ghost active-chip" : "ghost"}
                  onClick={() => setDomainTab(tab)}
                >
                  {label} ({tabCounts[tab]})
                </button>
              ))}
            </div>

            <div className="domain-list">
              {filteredDomains.map((domain) => renderDomainCard(domain))}
              {!filteredDomains.length ? (
                <div className="empty-block">
                  {l("Для выбранной вкладки доменов пока нет.", "There are no domains in the selected tab yet.")}
                </div>
              ) : null}
            </div>
          </div>

          <div className="stack">
            {renderNewDomainSettings()}

            <div className="card">
              <h2>{l("Добавить один домен", "Add one domain")}</h2>
              <form className="form" onSubmit={submitSingleDomain}>
                {renderField(
                  "Домен",
                  "Domain",
                  <input placeholder="example.fr" value={singleDomain} disabled={!canUseFeatures} onChange={(event) => setSingleDomain(event.target.value)} />,
                )}
                <button type="submit" disabled={!canUseFeatures}>
                  {l("Добавить домен", "Add domain")}
                </button>
              </form>
            </div>

            <div className="card">
              <h2>{l("Добавить список доменов", "Bulk import")}</h2>
              <form className="form" onSubmit={submitBulkDomains}>
                {renderField(
                  "Список доменов",
                  "Domain list",
                  <textarea
                    rows={6}
                    placeholder={"example.fr\nanother.fr"}
                    value={bulkDomains}
                    disabled={!canUseFeatures}
                    onChange={(event) => setBulkDomains(event.target.value)}
                  />,
                )}
                <button type="submit" disabled={!canUseFeatures}>
                  {l("Импортировать список", "Import list")}
                </button>
              </form>
            </div>

            <div className="card">
              <h2>{l("Загрузить файл", "Upload file")}</h2>
              <form className="form" onSubmit={submitUpload}>
                {renderField(
                  "Файл",
                  "File",
                  <input id="domain-file" type="file" accept=".txt,.csv,.xlsx" disabled={!canUseFeatures} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />,
                )}
                <button type="submit" disabled={!canUseFeatures}>
                  {l("Загрузить файл", "Upload file")}
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="grid two">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>{l("Прокси", "Proxies")}</h2>
                <span className="muted">
                  {l("Прокси используются только для RDAP fallback. DNS через прокси не идет.", "Proxies are used only for RDAP fallback. DNS never goes through proxies.")}
                </span>
              </div>
            </div>

            <form className="form inline" onSubmit={submitProxy}>
              <input
                placeholder="socks5://login:password@127.0.0.1:1080"
                value={proxyUrl}
                disabled={!canUseFeatures}
                onChange={(event) => setProxyUrl(event.target.value)}
              />
              <button type="submit" disabled={!canUseFeatures}>
                {l("Добавить прокси", "Add proxy")}
              </button>
            </form>

            <div className="proxy-list">
              {proxies.map((proxy) => (
                <article key={proxy.id} className="proxy-row">
                  <div>
                    <strong>{proxy.display_url}</strong>
                    <p className="muted">
                      {l("Статус", "Status")}: {statusLabel(proxy.status, language)} | {l("Ошибок", "Failures")}: {proxy.fail_count}
                    </p>
                  </div>
                  <button type="button" className="danger" disabled={!canUseFeatures} onClick={() => void removeProxy(proxy.id)}>
                    {l("Удалить", "Remove")}
                  </button>
                </article>
              ))}
              {!proxies.length ? <div className="empty-block">{l("Прокси пока не добавлены.", "No proxies yet.")}</div> : null}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h2>{l("Последние события", "Recent events")}</h2>
                <span className="muted">
                  {l(
                    "Время выводится с миллисекундами: подтверждение доступности, смена владельца, ошибки RDAP и рестарты воркеров.",
                    "Time is shown with milliseconds for availability, owner changes, RDAP failures, and worker restarts.",
                  )}
                </span>
              </div>
            </div>
            <div className="log-list">
              {logs.map((entry) => (
                <article key={entry.id} className="log-row">
                  <span className={STATUS_CLASS[entry.event_type] ?? "status"}>{statusLabel(entry.event_type, language)}</span>
                  <div>
                    <strong>{formatPreciseDate(entry.created_at, language)}</strong>
                    <p>{entry.message}</p>
                  </div>
                </article>
              ))}
              {!logs.length ? <div className="empty-block">{l("Логов пока нет.", "No logs yet.")}</div> : null}
            </div>
          </div>
        </section>
      </>
    );
  }

  function renderProfile() {
    return (
      <section className="grid two">
        <div className="stack">
          <div className="card">
            <h2>{l("Профиль", "Profile")}</h2>
            <div className="key-value">
              <div>
                <span>{l("Логин", "Username")}</span>
                <strong>{session?.user.username}</strong>
              </div>
              <div>
                <span>{l("Роль", "Role")}</span>
                <strong>{session?.user.role}</strong>
              </div>
              <div>
                <span>{l("Статус", "Status")}</span>
                <strong>{statusLabel(session?.user.status ?? "", language)}</strong>
              </div>
              <div>
                <span>{l("Доступ до", "Access until")}</span>
                <strong>{formatPreciseDate(session?.user.access_expires_at ?? null, language)}</strong>
              </div>
              <div>
                <span>{l("Осталось", "Remaining")}</span>
                <strong>{formatRemaining(session?.user.access_expires_at ?? null, language)}</strong>
              </div>
              <div>
                <span>{l("Домены / Прокси", "Domains / Proxies")}</span>
                <strong>
                  {domains.length} / {proxies.length}
                </strong>
              </div>
            </div>
            {!canUseFeatures ? <div className="inline-alert error">{userMessage}</div> : null}
          </div>

          <div className="card">
            <h2>{l("Промокод", "Promo code")}</h2>
            <form className="form inline" onSubmit={submitPromo}>
              <input placeholder={l("Введите промокод", "Enter promo code")} value={promoInput} onChange={(event) => setPromoInput(event.target.value)} />
              <button type="submit">{l("Активировать", "Apply")}</button>
            </form>
          </div>

          <div className="card">
            <h2>Telegram</h2>
            <form className="form" onSubmit={saveTelegram}>
              {renderField(
                "Токен бота",
                "Bot token",
                <input value={telegramForm.telegram_token} onChange={(event) => setTelegramForm((current) => ({ ...current, telegram_token: event.target.value }))} />,
              )}
              {renderField(
                "Chat ID",
                "Chat ID",
                <input value={telegramForm.telegram_chat_id} onChange={(event) => setTelegramForm((current) => ({ ...current, telegram_chat_id: event.target.value }))} />,
              )}
              <div className="actions">
                <button type="submit">{l("Сохранить", "Save")}</button>
                <button type="button" className="ghost" onClick={() => void testTelegram()}>
                  {l("Тест уведомления", "Send test")}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>{l("Смена пароля", "Change password")}</h2>
            <form className="form" onSubmit={submitPassword}>
              {renderField(
                "Текущий пароль",
                "Current password",
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
                />,
              )}
              {renderField(
                "Новый пароль",
                "New password",
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
                />,
              )}
              <button type="submit">{l("Обновить пароль", "Update password")}</button>
            </form>
          </div>

          <div className="card">
            <h2>{l("Состояние мониторинга", "Monitoring health")}</h2>
            <div className="key-value compact">
              <div>
                <span>{l("Воркеров в памяти", "Workers in memory")}</span>
                <strong>{monitoringHealth?.workers_in_memory ?? 0}</strong>
              </div>
              <div>
                <span>{l("Застывшие домены", "Stale domains")}</span>
                <strong>{monitoringHealth?.stale_domains ?? 0}</strong>
              </div>
              <div>
                <span>{l("Последняя синхронизация", "Last sync")}</span>
                <strong>{formatPreciseDate(monitoringHealth?.checked_at ?? null, language)}</strong>
              </div>
              <div>
                <span>{l("Доступных доменов", "Available domains")}</span>
                <strong>{availableCount}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderAdmin() {
    if (!isAdmin) {
      return null;
    }

    return (
      <section className="grid admin-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>{l("Пользователи", "Users")}</h2>
              <span className="muted">
                {l(
                  "Одобрение, блокировка, лимиты по доменам, ручная выдача доступа и восстановление мягко удаленных аккаунтов.",
                  "Approval, blocking, domain limits, manual access grants, and restoration of soft-deleted accounts.",
                )}
              </span>
            </div>
            <button type="button" className="ghost" onClick={() => void loadAdmin()}>
              {l("Обновить", "Refresh")}
            </button>
          </div>

          <div className="form inline filters">
            <select value={adminStatusFilter} onChange={(event) => setAdminStatusFilter(event.target.value)}>
              <option value="">{l("Все статусы", "All statuses")}</option>
              <option value="pending">{l("Ожидает", "Pending")}</option>
              <option value="approved">{l("Одобрен", "Approved")}</option>
              <option value="blocked">{l("Заблокирован", "Blocked")}</option>
              <option value="rejected">{l("Отклонен", "Rejected")}</option>
            </select>
            <label className="checkbox">
              <input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} />
              <span>{l("Показывать удаленных", "Include deleted")}</span>
            </label>
          </div>

          <form className="form two-columns" onSubmit={submitManualUser}>
            <input placeholder={l("Логин", "Username")} value={manualUserForm.username} onChange={(event) => setManualUserForm((current) => ({ ...current, username: event.target.value }))} />
            <input placeholder={l("Пароль", "Password")} value={manualUserForm.password} onChange={(event) => setManualUserForm((current) => ({ ...current, password: event.target.value }))} />
            <select value={manualUserForm.role} onChange={(event) => setManualUserForm((current) => ({ ...current, role: event.target.value }))}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <select value={manualUserForm.status} onChange={(event) => setManualUserForm((current) => ({ ...current, status: event.target.value }))}>
              <option value="approved">{l("Одобрен", "Approved")}</option>
              <option value="pending">{l("Ожидает", "Pending")}</option>
              <option value="blocked">{l("Заблокирован", "Blocked")}</option>
            </select>
            <select value={manualUserForm.language} onChange={(event) => setManualUserForm((current) => ({ ...current, language: event.target.value }))}>
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
            <input placeholder={l("Лимит доменов", "Domain limit")} value={manualUserForm.maxDomains} onChange={(event) => setManualUserForm((current) => ({ ...current, maxDomains: event.target.value }))} />
            <button type="submit">{l("Создать пользователя", "Create user")}</button>
          </form>

          <div className="user-list">
            {adminUsers.map((user) => {
              const draft = userDrafts[user.id];
              if (!draft) {
                return null;
              }
              return (
                <article key={user.id} className="user-card">
                  <div className="user-card-head">
                    <div>
                      <strong>@{user.username}</strong>
                      <p>
                        <span className={STATUS_CLASS[user.status] ?? "status"}>{statusLabel(user.status, language)}</span>{" "}
                        <span className="muted">
                          {user.role} | {l("Домены", "Domains")}: {user.domain_count} | {l("Прокси", "Proxies")}: {user.proxy_count}
                        </span>
                      </p>
                    </div>
                    <div className="muted">{formatPreciseDate(user.access_expires_at, language)}</div>
                  </div>

                  <div className="form two-columns compact-grid">
                    <select value={draft.status} onChange={(event) => setUserDrafts((current) => ({ ...current, [user.id]: { ...current[user.id], status: event.target.value } }))}>
                      <option value="pending">{l("Ожидает", "Pending")}</option>
                      <option value="approved">{l("Одобрен", "Approved")}</option>
                      <option value="blocked">{l("Заблокирован", "Blocked")}</option>
                      <option value="rejected">{l("Отклонен", "Rejected")}</option>
                    </select>
                    <select value={draft.role} onChange={(event) => setUserDrafts((current) => ({ ...current, [user.id]: { ...current[user.id], role: event.target.value } }))}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                      <option value="owner">owner</option>
                    </select>
                    <select value={draft.language} onChange={(event) => setUserDrafts((current) => ({ ...current, [user.id]: { ...current[user.id], language: event.target.value } }))}>
                      <option value="ru">RU</option>
                      <option value="en">EN</option>
                    </select>
                    <input placeholder={l("Лимит доменов", "Domain limit")} value={draft.maxDomains} onChange={(event) => setUserDrafts((current) => ({ ...current, [user.id]: { ...current[user.id], maxDomains: event.target.value } }))} />
                    <input className="wide-input" placeholder={l("Сообщение пользователю", "Status message")} value={draft.statusMessage} onChange={(event) => setUserDrafts((current) => ({ ...current, [user.id]: { ...current[user.id], statusMessage: event.target.value } }))} />
                  </div>

                  <div className="actions wrap">
                    <button type="button" onClick={() => void saveAdminUser(user.id)}>
                      {l("Сохранить", "Save")}
                    </button>
                    {ACCESS_PRESETS.map((preset) => (
                      <button key={preset.label} type="button" className="ghost" onClick={() => void grantUserAccess(user.id, preset.seconds)}>
                        +{preset.label}
                      </button>
                    ))}
                    {!user.deleted_at ? (
                      <button type="button" className="danger" onClick={() => void softDeleteUser(user.id)}>
                        {l("Мягко удалить", "Soft delete")}
                      </button>
                    ) : (
                      <button type="button" className="ghost" onClick={() => void restoreUser(user.id)}>
                        {l("Восстановить", "Restore")}
                      </button>
                    )}
                    <button type="button" className="danger" onClick={() => void hardDeleteUser(user.id)}>
                      {l("Удалить навсегда", "Hard delete")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>{l("Промокоды", "Promo codes")}</h2>
            <form className="form" onSubmit={submitPromoCode}>
              <input placeholder={l("Код", "Code")} value={promoForm.code} onChange={(event) => setPromoForm((current) => ({ ...current, code: event.target.value }))} />
              <input placeholder={l("Длительность в днях", "Duration in days")} value={promoForm.durationDays} onChange={(event) => setPromoForm((current) => ({ ...current, durationDays: event.target.value }))} />
              <input placeholder={l("Лимит активаций", "Max activations")} value={promoForm.maxActivations} onChange={(event) => setPromoForm((current) => ({ ...current, maxActivations: event.target.value }))} />
              <input type="datetime-local" value={promoForm.expiresAt} onChange={(event) => setPromoForm((current) => ({ ...current, expiresAt: event.target.value }))} />
              <label className="checkbox">
                <input type="checkbox" checked={promoForm.isActive} onChange={(event) => setPromoForm((current) => ({ ...current, isActive: event.target.checked }))} />
                <span>{l("Активен", "Active")}</span>
              </label>
              <button type="submit">{l("Создать промокод", "Create promo code")}</button>
            </form>

            <div className="promo-list">
              {promoCodes.map((code) => (
                <article key={code.id} className="promo-row">
                  <strong>{code.code}</strong>
                  <p>
                    {l("Длительность", "Duration")}: {(code.duration_seconds / 86_400).toFixed(1)} {l("дней", "days")}
                  </p>
                  <p>
                    {l("Использовано", "Used")}: {code.activation_count}
                    {code.max_activations ? ` / ${code.max_activations}` : " / ∞"}
                  </p>
                  <p>
                    {l("Истекает", "Expires")}: {formatPreciseDate(code.expires_at, language)}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>{l("Аудит администратора", "Admin audit")}</h2>
            <div className="log-list">
              {auditLogs.map((entry) => (
                <article key={entry.id} className="log-row">
                  <span className="status info">{entry.action}</span>
                  <div>
                    <strong>{formatPreciseDate(entry.created_at, language)}</strong>
                    <p>
                      actor={entry.actor_user_id ?? "-"} target={entry.target_user_id ?? "-"}
                      {entry.details ? ` | ${entry.details}` : ""}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (authLoading) {
    return <div className="shell loading">{l("Загрузка...", "Loading...")}</div>;
  }

  if (!session) {
    return renderAuth();
  }

  return (
    <div className="app-shell">
      <header className="hero hero-top">
        <div>
          <p className="eyebrow">Real-Time .fr Monitoring</p>
          <h1>FR Domain Drop Monitor</h1>
          <p className="subtitle">
            {l(
              "Изолированные аккаунты, watchdog для доменов, точное время освобождения и смены владельца, личные Telegram-боты и явные режимы мониторинга.",
              "Isolated accounts, worker watchdogs, exact release and owner-change timing, personal Telegram bots, and explicit monitoring modes.",
            )}
          </p>
          <div className="hero-meta">
            <span className={STATUS_CLASS[session.user.status] ?? "status"}>{statusLabel(session.user.status, language)}</span>
            <span className="muted">
              {l("Доступ:", "Access:")} {formatRemaining(session.user.access_expires_at, language)}
            </span>
            {session.user.max_domains ? (
              <span className="muted">
                {l("Лимит доменов:", "Domain limit:")} {session.user.max_domains}
              </span>
            ) : null}
          </div>
        </div>
        <div className="stats">
          <article>
            <span>{l("Всего доменов", "Tracked")}</span>
            <strong>{domains.length}</strong>
          </article>
          <article>
            <span>{l("Активно сейчас", "Active now")}</span>
            <strong>{activeCount}</strong>
          </article>
          <article>
            <span>{l("Доступны", "Available")}</span>
            <strong>{availableCount}</strong>
          </article>
          <article>
            <span>{l("Перехвачены", "Captured")}</span>
            <strong>{capturedCount}</strong>
          </article>
        </div>
      </header>

      <div className="toolbar">
        <div className="tab-strip">
          <button type="button" className={view === "dashboard" ? "ghost active-chip" : "ghost"} onClick={() => setView("dashboard")}>
            {l("Панель", "Dashboard")}
          </button>
          <button type="button" className={view === "profile" ? "ghost active-chip" : "ghost"} onClick={() => setView("profile")}>
            {l("Профиль", "Profile")}
          </button>
          {isAdmin ? (
            <button type="button" className={view === "admin" ? "ghost active-chip" : "ghost"} onClick={() => setView("admin")}>
              {l("Админка", "Admin")}
            </button>
          ) : null}
        </div>

        <div className="toolbar-actions">
          <div className="lang-toggle">
            <button type="button" className={language === "ru" ? "ghost active-chip" : "ghost"} onClick={() => setLanguage("ru")}>
              RU
            </button>
            <button type="button" className={language === "en" ? "ghost active-chip" : "ghost"} onClick={() => setLanguage("en")}>
              EN
            </button>
          </div>
          <span className="muted">@{session.user.username}</span>
          <button type="button" className="ghost" onClick={() => void logout()}>
            {l("Выйти", "Logout")}
          </button>
        </div>
      </div>

      {toast ? <div className={`toast ${toast.type}`}>{toast.text}</div> : null}
      {!canUseFeatures ? <div className="toast error">{userMessage}</div> : null}
      {monitoringHealth?.stale_domains ? (
        <div className="toast error">
          {l(
            `Найдены застывшие воркеры: ${monitoringHealth.stale_domains}. Watchdog должен перезапустить их автоматически.`,
            `Stale workers detected: ${monitoringHealth.stale_domains}. The watchdog should restart them automatically.`,
          )}
        </div>
      ) : null}

      {view === "dashboard" ? renderDashboard() : null}
      {view === "profile" ? renderProfile() : null}
      {view === "admin" ? renderAdmin() : null}
    </div>
  );
}
