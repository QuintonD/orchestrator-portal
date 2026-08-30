import { useCallback, useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { api, ApiError } from "./lib.js";
import { AppShell, Mark, Toast, routes } from "./components.js";
import { AssistantPage, AttentionPage, BrainPage, ConnectionsPage, InsightsPage, OverviewPage, SettingsPage, WorkPage } from "./pages.js";

interface AuthStatus {
  mode: "demo" | "private";
  authenticated: boolean;
  setupRequired: boolean;
  user: { id: string; displayName: string } | null;
}

interface ToastState { message: string; tone: "neutral" | "success" | "error" }

function currentPath(): string {
  return routes.some((route) => route.path === window.location.pathname) ? window.location.pathname : "/";
}

export function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [route, setRoute] = useState(currentPath);
  const [theme, setThemeState] = useState<"light" | "dark">(() => (localStorage.getItem("orchestrator-theme") as "light" | "dark") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [attentionCount, setAttentionCount] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("orchestrator-theme", theme);
  }, [theme]);

  useEffect(() => {
    api<AuthStatus>("/api/auth/status").then(setAuth).catch(() => setAuth({ mode: "private", authenticated: false, setupRequired: false, user: null }));
    const onPop = () => setRoute(currentPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((path: string) => {
    if (path !== window.location.pathname) history.pushState(null, "", path);
    setRoute(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const notify = useCallback((message: string, tone: ToastState["tone"] = "neutral") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 4_500);
  }, []);

  if (!auth) return <div className="boot-screen"><Mark /><span className="loading-orbit" /></div>;
  if (!auth.authenticated) return <AuthScreen status={auth} onAuthenticated={() => api<AuthStatus>("/api/auth/status").then(setAuth)} />;

  const pageProps = { notify };
  const page = route === "/assistant" ? <AssistantPage {...pageProps} />
    : route === "/work" ? <WorkPage {...pageProps} />
      : route === "/attention" ? <AttentionPage {...pageProps} onCountChange={setAttentionCount} />
        : route === "/brain" ? <BrainPage {...pageProps} />
          : route === "/insights" ? <InsightsPage {...pageProps} />
            : route === "/connections" ? <ConnectionsPage {...pageProps} />
              : route === "/settings" ? <SettingsPage {...pageProps} auth={auth} onSignedOut={() => setAuth({ ...auth, authenticated: false, user: null })} />
                : <OverviewPage {...pageProps} displayName={auth.user?.displayName ?? "Operator"} navigate={navigate} onAttentionCount={setAttentionCount} />;

  return (
    <>
      <AppShell route={route} navigate={navigate} displayName={auth.user?.displayName ?? "Operator"} theme={theme} setTheme={setThemeState} attentionCount={attentionCount}>
        {page}
      </AppShell>
      {toast && <Toast {...toast} dismiss={() => setToast(null)} />}
    </>
  );
}

function AuthScreen({ status, onAuthenticated }: { status: AuthStatus; onAuthenticated(): void }) {
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setup = status.setupRequired;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api(setup ? "/api/auth/setup" : "/api/auth/login", { method: "POST", body: JSON.stringify(setup ? { displayName, password } : { password }) });
      onAuthenticated();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not sign in");
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-screen">
      <div className="auth-atmosphere" />
      <section className="auth-intro">
        <Mark />
        <div className="auth-copy">
          <p className="eyebrow">Your assistant, in focus</p>
          <h1>See what matters.<br /><span>Delegate the rest.</span></h1>
          <p>A private command centre for conversations, active work, decisions, knowledge, and outcomes—without living in a chat feed.</p>
        </div>
        <div className="trust-row"><span><ShieldCheck size={17} /> Local-first</span><span><LockKeyhole size={17} /> Encrypted at rest</span></div>
      </section>
      <section className="auth-panel">
        <form onSubmit={submit}>
          <div className="auth-panel__icon"><LockKeyhole size={22} /></div>
          <p className="eyebrow">{setup ? "Private setup" : "Welcome back"}</p>
          <h2>{setup ? "Create your workspace" : "Unlock Orchestrator"}</h2>
          <p>{setup ? "This passphrase protects the portal. It never leaves this server." : "Enter your workspace passphrase to continue."}</p>
          {setup && <label><span>Your name</span><input autoFocus autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should we address you?" required /></label>}
          <label><span>Passphrase</span><input autoFocus={!setup} type="password" autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={setup ? "At least 12 characters" : "Your passphrase"} minLength={setup ? 12 : 1} required /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="button button--primary button--full" disabled={busy}>{busy ? "Securing workspace…" : setup ? "Create workspace" : "Continue"}<ArrowRight size={17} /></button>
          <small>Designed to run on your machine or private network.</small>
        </form>
      </section>
    </main>
  );
}
