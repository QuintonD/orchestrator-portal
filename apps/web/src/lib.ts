export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function csrfToken(): string | undefined {
  return document.cookie.split("; ").find((part) => part.startsWith("orchestrator_csrf="))?.split("=")[1];
}

let requestSequence = 0;
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const csrf = csrfToken();
  if (csrf && !["GET", "HEAD"].includes(options.method ?? "GET")) headers.set("x-csrf-token", decodeURIComponent(csrf));
  const mutation = !["GET", "HEAD"].includes(options.method ?? "GET");
  const requestId = mutation ? String(++requestSequence) : null;
  // Only lifecycle metadata is exposed to the avatar; never request/response content.
  if (requestId) window.dispatchEvent(new CustomEvent("orchestrator:request", { detail: { id: requestId, active: true } }));
  let response: Response;
  try { response = await fetch(path, { ...options, headers, credentials: "same-origin" }); }
  finally { if (requestId) window.dispatchEvent(new CustomEvent("orchestrator:request", { detail: { id: requestId, active: false } })); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `Request failed (${response.status})` })) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function relativeTime(value: string | null): string {
  if (!value) return "Not scheduled";
  const delta = Date.parse(value) - Date.now();
  const abs = Math.abs(delta);
  const suffix = delta >= 0 ? "from now" : "ago";
  if (abs < 60_000) return delta >= 0 ? "now" : "just now";
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)}m ${suffix}`;
  if (abs < 86_400_000) return `${Math.round(abs / 3_600_000)}h ${suffix}`;
  return `${Math.round(abs / 86_400_000)}d ${suffix}`;
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function money(value: number): string {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export function greeting(name: string): string {
  const hour = new Date().getHours();
  return `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${name}`;
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
