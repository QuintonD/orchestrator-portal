import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Bell,
  BrainCircuit,
  Cable,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleDot,
  Gauge,
  ListTodo,
  Menu,
  MessageCircle,
  Moon,
  Search,
  Settings2,
  Sun,
  X,
  UsersRound,
  Orbit,
  FileCheck2,
  Activity,
} from "lucide-react";
import { cx } from "./lib.js";
import { EcosystemDock } from "./ecosystem-presence.js";

export const routes = [
  { path: "/", label: "Portal", icon: Gauge },
  { path: "/personal", label: "Today", icon: CircleDot },
  { path: "/assistant", label: "Conversations", icon: MessageCircle },
  { path: "/work", label: "Work", icon: ListTodo },
  { path: "/agents", label: "Team", icon: UsersRound },
  { path: "/reports", label: "Reports", icon: FileCheck2 },
  { path: "/councils", label: "Councils", icon: Orbit },
  { path: "/activity", label: "Activity", icon: Activity },
  { path: "/attention", label: "Attention", icon: AlertCircle },
  { path: "/brain", label: "Knowledge", icon: BrainCircuit },
  { path: "/insights", label: "Insights", icon: ChartNoAxesCombined },
  { path: "/connections", label: "Connections", icon: Cable },
  { path: "/setup", label: "Get started", icon: Check },
  { path: "/settings", label: "Settings", icon: Settings2 },
] as const;

const corePaths: readonly string[] = ["/", "/personal", "/work", "/agents", "/reports", "/assistant"];
const coreRoutes = corePaths.map((path) => routes.find((route) => route.path === path)!);

export function Mark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx("brand", compact && "brand--compact")} aria-label="Orchestrator">
      <span className="brand__mark" aria-hidden="true"><span /></span>
      {!compact && <span className="brand__name">Orchestrator</span>}
    </div>
  );
}

export function AppShell({
  children,
  route,
  navigate,
  displayName,
  theme,
  setTheme,
  attentionCount,
}: {
  children: ReactNode;
  route: string;
  navigate(path: string): void;
  displayName: string;
  theme: "light" | "dark";
  setTheme(theme: "light" | "dark"): void;
  attentionCount: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = drawerRef.current;
    drawer?.showModal();
    return () => { drawer?.close(); previous?.focus(); };
  }, [mobileOpen]);
  function go(path: string) { setMobileOpen(false); navigate(path); }
  return (
    <div className="shell">
      <aside className="sidebar">
        <Mark />
        <nav className="side-nav" aria-label="Primary navigation">
          {coreRoutes.map((item) => {
            const active = route === item.path;
            return (
              <button key={item.path} title={item.label} aria-label={item.label} className={cx("nav-item", active && "is-active")} onClick={() => navigate(item.path)} aria-current={active ? "page" : undefined}>
                <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
                {item.path === "/attention" && attentionCount > 0 && <span className="nav-count">{attentionCount}</span>}
              </button>
            );
          })}
          <button className={cx("nav-item", "nav-secondary", !corePaths.includes(route) && "is-active")} title="More destinations" aria-label="More destinations" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={18} /></button>
        </nav>
        <div className="sidebar__footer">
          <div className="system-state">Local workspace</div>
          <button className="profile-button" onClick={() => navigate("/settings")}>
            <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{displayName}</strong><small>Private workspace</small></span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="workspace-label"><b>ORCHESTRATOR</b><span> / </span> {routes.find((item) => item.path === route)?.label}</div>
          <button className="command-search" onClick={() => navigate("/brain")}><Search size={17} /><span>Search knowledge</span></button>
          <div className="topbar__actions">
            <EcosystemDock navigate={navigate} />
            <button className="icon-button" aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => navigate("/attention")}>
              <Bell size={18} />{attentionCount > 0 && <span />}
            </button>
          </div>
        </header>
        <div className="page-stage">{children}</div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {coreRoutes.map((item) => {
          const active = route === item.path;
          return <button key={item.path} aria-current={active ? "page" : undefined} className={cx(active && "is-active")} aria-label={item.label} onClick={() => navigate(item.path)}><item.icon size={21} /><span>{item.path === "/assistant" ? "Chat" : item.label}</span></button>;
        })}
      </nav>
      {mobileOpen && <dialog ref={drawerRef} aria-label="Navigation" className="mobile-drawer-backdrop" onCancel={() => setMobileOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
        <aside className="mobile-drawer" aria-label="All navigation">
          <div className="mobile-drawer__head"><Mark /><button className="icon-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
          <nav>{routes.map((item) => <button key={item.path} className={cx(route === item.path && "is-active")} onClick={() => go(item.path)}><item.icon size={19} /><span>{item.label}</span>{item.path === "/attention" && attentionCount > 0 && <span className="nav-count">{attentionCount}</span>}</button>)}</nav>
          <div className="mobile-drawer__state">Local workspace</div>
        </aside>
      </dialog>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, detail, actions }: { eyebrow?: string; title: string; detail: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{detail}</p></div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={cx("card", className)}>
      {(title || action) && <div className="card__header">{title && <h2>{title}</h2>}{action}</div>}
      {children}
    </section>
  );
}

export function StatusPill({ state, children }: { state: string; children?: ReactNode }) {
  const normalized = state.toLowerCase().replaceAll("_", "-");
  return <span className={cx("status-pill", `status-pill--${normalized}`)}><CircleDot size={10} />{children ?? state.replaceAll("-", " ")}</span>;
}

export function EmptyState({ icon, title, detail, action }: { icon?: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state">{icon}<h3>{title}</h3><p>{detail}</p>{action}</div>;
}

export function Skeleton({ lines = 4 }: { lines?: number }) {
  return <div className="skeleton-stack" aria-label="Loading">{Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${92 - (index % 3) * 13}%` }} />)}</div>;
}

export function Toast({ message, tone = "neutral", dismiss }: { message: string; tone?: "neutral" | "success" | "error"; dismiss(): void }) {
  return <div className={cx("toast", `toast--${tone}`)} role="status">{tone === "success" && <Check size={17} />}{tone === "error" && <AlertCircle size={17} />}<span>{message}</span><button onClick={dismiss} aria-label="Dismiss"><X size={15} /></button></div>;
}
