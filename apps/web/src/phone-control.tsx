import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Copy, RefreshCw, ShieldCheck, Smartphone, Square, X } from "lucide-react";
import { api, relativeTime } from "./lib.js";
import { Card, PageHeader, StatusPill } from "./components.js";
import "./phone-control.css";

const methods = ["describe", "observe", "apps.list", "app.launch", "tap", "longPress", "swipe", "pinch", "type", "key", "stop", "fixture.increment", "node.click", "node.scroll"] as const;
type Method = typeof methods[number];
const mutations: Method[] = ["app.launch", "tap", "longPress", "swipe", "pinch", "type", "key", "node.click", "node.scroll", "fixture.increment"];
interface Disclosure { screenshots: boolean }
interface Scope { apps: string[]; operations: Method[]; disclosure?: Disclosure; expiresAt: string; revokedAt?: string }
interface ScopeInput { apps: string[]; operations: Method[]; disclosure: Disclosure; ttlSeconds: number; label: string }
interface PhoneTask { id: string; deviceId: string; sessionId: string; actorId?: string; label?: string; expiresAt: string; maxActions: number; actionsUsed: number; status: "active" | "completed" | "expired" | "revoked" | "interrupted"; outcome: "unverified" }
interface Session extends Scope { id: string; deviceId: string }
interface Credential extends Scope { id: string; label: string; devices: string[]; sessionIds?: string[]; token?: string }
interface Event { at: string; actorId: string; deviceId?: string; method?: string; status: string; code?: string }
interface State { mode: "demo" | "disabled" | "unavailable" | "connected"; storageState?: "ready" | "unavailable"; devices: { id: string; label: string; busy: boolean; connection?: "recently_observed" | "unknown"; lastSeenAt?: string; actionState?: "ready" | "unknown" }[]; sessions: Session[]; credentials: Credential[]; events: Event[]; tasks?: PhoneTask[] }
interface Observation {
  observationId: string; packageName: string; windowId: number | string; width: number; height: number; capturedAt: string; blockedReason?: string;
  screenshot?: { mimeType: "image/png"; base64: string };
  touchBounds?: { left: number; top: number; right: number; bottom: number };
  nodes: { id: string; text?: string; description?: string; bounds: { left: number; top: number; right: number; bottom: number }; editable: boolean; clickable: boolean; resourceId?: string; className?: string; enabled?: boolean; scrollable?: boolean; checkable?: boolean; checkedState?: "unchecked" | "checked" | "mixed"; selected?: boolean; stateDescription?: string; hintText?: string; actions?: string[] }[];
}
interface Description { methods?: Method[]; capabilities?: { screenshots: boolean; gestures: boolean; biometricConsent: boolean } }
interface Receipt { id: string; status: "observed" | "completed" | "rejected" | "unknown"; result?: unknown; error?: { code: string; message: string } }
type Notify = (message: string, tone?: "neutral" | "success" | "error") => void;
const errorText = (error: unknown) => error instanceof Error ? error.message : "The phone request could not be completed.";
const active = (scope: Scope) => !scope.revokedAt && Date.parse(scope.expiresAt) > Date.now();
const stateLabels = { demo: "Synthetic preview", disabled: "Not configured", unavailable: "Broker unavailable", connected: "Broker connected" };
const pendingKey = "orchestrator.phone-control.pending.v1";
interface PendingAction { deviceId: string; id: string }
function pendingActions(): PendingAction[] {
  const raw: unknown = JSON.parse(localStorage.getItem(pendingKey) ?? "[]");
  if (!Array.isArray(raw) || raw.length > 100 || raw.some((item) => !item || typeof item.deviceId !== "string" || typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,96}$/.test(item.deviceId) || !/^[A-Za-z0-9_-]{1,96}$/.test(item.id))) throw new Error("Phone recovery metadata is unavailable. Stop phone access before repairing browser storage.");
  return raw;
}

export function PhoneControlPage({ notify }: { notify: Notify }) {
  const [state, setState] = useState<State | null>(null);
  const [failure, setFailure] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [screenshot, setScreenshot] = useState(false);
  const [observation, setObservation] = useState<Observation | null>(null);
  const [description, setDescription] = useState<Description | null>(null);
  const [apps, setApps] = useState<{ packageName: string; label: string }[]>([]);
  const [receipts, setReceipts] = useState<(Receipt & { method: Method; at: string })[]>([]);
  const [issued, setIssued] = useState<Credential | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [pending, setPending] = useState<PendingAction[]>(() => { try { return pendingActions(); } catch { return []; } });
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(() => { try { pendingActions(); return false; } catch { return true; } });
  const generation = useRef(0);
  const statusRequest = useRef(0);
  const ownerTask = useRef<PhoneTask | null>(null);
  const selectedDevice = state?.devices.find((device) => device.id === deviceId);
  const sessions = state?.sessions.filter((item) => item.deviceId === deviceId) ?? [];
  const selectedSession = sessions.find((item) => item.id === sessionId && active(item));
  const connected = state?.mode === "connected";
  const storageReady = state?.storageState !== "unavailable";
  const canCall = Boolean(connected && storageReady && selectedSession && !busy && !stopping);
  const localUnknown = recoveryUnavailable || pending.some((item) => item.deviceId === deviceId);
  const manualTask = state?.tasks?.find((task) => task.id === ownerTask.current?.id && task.deviceId === deviceId && task.sessionId === sessionId && task.status === "active" && Date.parse(task.expiresAt) > now && task.actionsUsed < task.maxActions);
  const fresh = Boolean(observation && !observation.blockedReason && now - Date.parse(observation.capturedAt) >= -5000 && now - Date.parse(observation.capturedAt) < 30000);
  async function load() {
    const sequence = ++statusRequest.current;
    try {
      const result = await api<State>("/api/phone-control/state");
      if (sequence !== statusRequest.current) return;
      setState(result); setFailure("");
      setDeviceId((id) => result.devices.some((item) => item.id === id) ? id : result.devices[0]?.id ?? "");
      if (result.mode !== "connected" || result.storageState === "unavailable") { generation.current++; setObservation(null); setDescription(null); }
      if (sessionId && !result.sessions.some((item) => item.id === sessionId && active(item))) { generation.current++; setObservation(null); setDescription(null); }
    } catch (error) { if (sequence !== statusRequest.current) return; setFailure(errorText(error)); setState(null); generation.current++; setObservation(null); setDescription(null); }
  }
  useEffect(() => { void load(); return () => { generation.current++; }; }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const changed = (event: StorageEvent) => { if (event.key !== pendingKey) return; try { setPending(pendingActions()); setRecoveryUnavailable(false); } catch { setRecoveryUnavailable(true); } }; window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed); }, []);
  function trackPending(id: string | null, acknowledgedId?: string) {
    const current = pendingActions();
    const next = current.filter((item) => item.deviceId !== deviceId || acknowledgedId && item.id !== acknowledgedId);
    if (id) { if (next.length >= 100) throw new Error("Phone recovery metadata is full"); next.push({ deviceId, id }); }
    localStorage.setItem(pendingKey, JSON.stringify(next)); setPending(next); setRecoveryUnavailable(false);
  }
  useEffect(() => { const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000); return () => window.clearInterval(timer); }, [sessionId]);
  useEffect(() => { generation.current++; setObservation(null); setDescription(null); setApps([]); setScreenshot(false); }, [deviceId, sessionId]);
  useEffect(() => { if (!selectedSession) { generation.current++; setObservation(null); setDescription(null); setApps([]); } }, [selectedSession?.id]);
  useEffect(() => { if (!selectedSession?.disclosure?.screenshots) { setScreenshot(false); setObservation((value) => { if (!value?.screenshot) return value; const { screenshot: _pixels, ...redacted } = value; return redacted; }); } }, [selectedSession?.disclosure?.screenshots]);
  useEffect(() => { if (observation && now - Date.parse(observation.capturedAt) >= 30000) setObservation(null); if (issued && !active(issued)) { setIssued(null); setRevealed(false); } }, [now, observation, issued]);
  async function create(kind: "sessions" | "credentials", scope: ScopeInput) {
    if (!connected || !storageReady || !deviceId || busy || kind === "credentials" && !selectedSession) return;
    setBusy(true); setIssued(null); setRevealed(false);
    try {
      if (kind === "sessions") {
        const result = await api<{ session: Session }>("/api/phone-control/sessions", { method: "POST", body: JSON.stringify({ deviceId, apps: scope.apps, operations: scope.operations, disclosure: scope.disclosure, ttlSeconds: scope.ttlSeconds }) });
        setSessionId(result.session.id); notify("Broker scope saved. Enable a matching session in the phone companion before use.");
      } else {
        const result = await api<{ credential: Credential }>("/api/phone-control/credentials", { method: "POST", body: JSON.stringify({ devices: [deviceId], sessionIds: [selectedSession!.id], ...scope }) });
        setIssued(result.credential); notify("Scoped agent credential created. Save it securely before dismissing.");
      }
      await load();
    } catch (error) { notify(errorText(error), "error"); await load(); } finally { setBusy(false); }
  }
  async function revoke(kind: "sessions" | "credentials", id: string) {
    setStopping(true); generation.current++; setObservation(null); setDescription(null);
    try {
      const result = await api<{ revoked: boolean; stopStatus?: string }>(`/api/phone-control/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (issued?.id === id) setIssued(null);
      notify(result.stopStatus === "unknown" ? "Revocation or phone stop is unconfirmed. Stop access on the phone and check broker storage." : "Broker access revoked. Check the phone for any work already dispatched.", result.stopStatus === "unknown" ? "error" : "neutral");
      await load();
    } catch (error) { notify(errorText(error), "error"); } finally { setStopping(false); }
  }
  async function stop() {
    if (!connected || !deviceId || stopping) return;
    setStopping(true); generation.current++; setObservation(null); setDescription(null);
    try {
      const result = await api<{ revoked: boolean; stopStatus: string }>(`/api/phone-control/devices/${encodeURIComponent(deviceId)}/stop`, { method: "POST", body: "{}" });
      if (result.stopStatus === "completed") { trackPending(null); ownerTask.current = null; }
      notify(result.stopStatus === "completed" ? "Phone stop receipt received. Sessions revoked; a gesture already dispatched may finish within two seconds." : "Stop is unconfirmed. Stop access on the phone and check broker storage before restoring access.", result.stopStatus === "completed" ? "neutral" : "error");
      await load();
    } catch (error) { notify(errorText(error), "error"); } finally { setStopping(false); }
  }
  async function call(method: Method, params: Record<string, unknown>) {
    if (!canCall || !selectedSession?.operations.includes(method)) return;
    if (mutations.includes(method)) {
      try { if (localUnknown || pendingActions().some((item) => item.deviceId === deviceId)) return; }
      catch { setRecoveryUnavailable(true); notify("Phone recovery metadata is unavailable. No action was sent.", "error"); return; }
    }
    const requestGeneration = generation.current;
    setBusy(true);
    // Any dispatched mutation invalidates the screen used to prepare it, even on transport failure.
    if (mutations.includes(method) || method === "observe") setObservation(null);
    const id = crypto.randomUUID();
    let dispatched = false;
    try {
      let taskId: string | undefined;
      if (mutations.includes(method)) {
        if (!manualTask) { notify("Reserve manual control, then observe the phone before preparing an action.", "error"); return; }
        taskId = manualTask.id;
        if (requestGeneration !== generation.current) return;
      }
      if (mutations.includes(method)) trackPending(id);
      dispatched = true;
      const result = await api<Receipt>("/api/phone-control/call", { method: "POST", body: JSON.stringify({ id, deviceId, sessionId, ...(taskId ? { taskId } : {}), method, params }) });
      if (mutations.includes(method) && result.id === id && ["completed", "rejected"].includes(result.status)) trackPending(null, id);
      setReceipts((items) => [{ ...result, result: undefined, method, at: new Date().toISOString() }, ...items].slice(0, 30));
      if (requestGeneration !== generation.current) return;
      if (result.status === "observed") {
        if (method === "observe") { setObservation(result.result as Observation); setNow(Date.now()); }
        if (method === "describe") setDescription(result.result as Description);
        if (method === "apps.list") setApps((result.result as { apps: typeof apps }).apps);
      }
      if (result.error) notify(`${result.error.code}: ${result.error.message}`, "error");
      else if (result.status === "completed") notify("Dispatch completed. Observe the phone again to inspect the result; the outcome is not verified.");
      if (mutations.includes(method)) await load();
    } catch {
      setReceipts((items) => [{ id, status: dispatched ? "unknown" as const : "rejected" as const, method, at: new Date().toISOString() }, ...items].slice(0, 30));
      notify(dispatched ? "No reliable receipt arrived. Inspect the phone before another action. The request was not retried." : "Phone control could not be reserved. Check active tasks below. No phone action was sent.", "error");
      await load();
    } finally { setBusy(false); }
  }
  async function reserveManualControl() {
    if (!canCall) return;
    setBusy(true); generation.current++; setObservation(null);
    try {
      const result = await api<{ task: PhoneTask }>("/api/phone-control/tasks", { method: "POST", body: JSON.stringify({ deviceId, sessionId, ttlSeconds: 180, maxActions: 30, label: "Owner manual control" }) });
      ownerTask.current = result.task;
      notify("Manual control reserved. Observe the phone before preparing an action.");
    } catch (error) { notify(errorText(error), "error"); }
    finally { setBusy(false); await load(); }
  }
  async function endManualControl() {
    const held = ownerTask.current;
    if (!held || busy) return;
    setBusy(true);
    try {
      await api(`/api/phone-control/tasks/${encodeURIComponent(held.id)}`, { method: "DELETE" });
      ownerTask.current = null; setObservation(null);
      notify("Manual control reservation ended. The task outcome remains unverified.");
    } catch (error) { notify(errorText(error), "error"); }
    finally { setBusy(false); await load(); }
  }
  return <div className="phone-control">
    <PageHeader title="Phone control" detail="Observe and operate a separately paired Android phone with local consent." actions={<>
      <button className="button button--secondary" onClick={load}><RefreshCw size={16} />Refresh status</button>
      <button className="button phone-danger" disabled={!connected || !deviceId || stopping} onClick={stop}><Square size={16} />Stop phone access</button>
    </>} />
    <div className="phone-status" role="status"><Smartphone size={20} /><strong>{state ? stateLabels[state.mode] : failure ? "Status unavailable" : "Checking broker…"}</strong><span>{selectedDevice?.busy ? "Phone has a request in progress" : "Phone consent remains authoritative"}</span></div>
    {failure && <p className="notice" role="alert">{failure}</p>}
    {state?.mode === "demo" && <p className="notice">This is a synthetic preview. Pairing, credentials, observations, and actions are disabled. No phone is contacted.</p>}
    {state?.mode === "unavailable" && <p className="notice" role="alert">The configured broker could not be read. Start the broker on this computer and refresh. No connection is retried automatically.</p>}
    {!storageReady && <p className="notice" role="alert">Broker storage is unavailable. Ordinary requests and new grants are disabled. Stop phone access remains available; stop the phone session before repairing the broker storage.</p>}
    <details className="phone-setup" open={state?.mode !== "connected"}>
      <summary>Set up the separate phone companion</summary>
      <ol>
        <li>Install the standalone Phone Control companion APK on Android 14 or newer. It is a separate app from the portal viewer.</li>
        <li>On the phone, explicitly enable its accessibility service and start a short session for the selected apps. General app actions require enrolled strong biometrics. The signed test fixture offers a separately authorized counter for devices without them.</li>
        <li>On the computer, connect the phone through USB debugging, forward the companion port with <code>adb forward</code>, and pair its device ID and private token file using the broker CLI. Follow <code>components/phone-control/README.md</code> in the checkout.</li>
        <li>Start the standalone broker and configure <code>ORCHESTRATOR_PHONE_BROKER_TOKEN</code> and the owner-provisioned public PEM in <code>ORCHESTRATOR_PHONE_BROKER_PUBLIC_KEY</code> in the portal server environment. Restart the portal, then refresh this page.</li>
      </ol>
      <p>Pairing secrets stay on the computer and phone. The portal cannot enable Android permissions, approve a biometric prompt, or extend phone consent. Use <strong>Stop access</strong> in the companion at any time.</p>
    </details>
    <div className="phone-grid">
      <Card title="Device and session">
        <label className="phone-label">Paired device<select disabled={!connected || busy} value={deviceId} onChange={(event) => { setDeviceId(event.target.value); setSessionId(""); }}><option value="">Choose a paired phone</option>{state?.devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</select></label>
        {connected && !state.devices.length && <p>No phones are paired. Complete the computer setup above.</p>}
        {selectedDevice && connected && <p className="form-note">Phone connection: {selectedDevice.connection === "recently_observed" ? `last observed ${relativeTime(selectedDevice.lastSeenAt ?? null)}` : "unknown; check capabilities to contact the device"}.</p>}
        {selectedDevice?.actionState === "unknown" && <p className="notice" role="alert">A prior action has an unknown outcome. Further actions are blocked until a phone stop is acknowledged. Use Stop phone access and inspect the phone.</p>}
        <label className="phone-label">Broker session<select disabled={!connected || busy} value={sessionId} onChange={(event) => setSessionId(event.target.value)}><option value="">Choose a session</option>{sessions.filter(active).map((item) => <option key={item.id} value={item.id}>{item.id.slice(0, 12)} · expires {relativeTime(item.expiresAt)}</option>)}</select></label>
        {selectedSession && <div className="phone-scope"><p>Apps: {selectedSession.apps.join(", ")}</p><p>Operations: {selectedSession.operations.join(", ")}</p><p>Expires: <time dateTime={selectedSession.expiresAt}>{new Date(selectedSession.expiresAt).toLocaleString()}</time></p><button className="button phone-danger" disabled={stopping} onClick={() => revoke("sessions", selectedSession.id)}>Revoke selected session</button></div>}
        <ScopeForm kind="sessions" disabled={!connected || !storageReady || !deviceId || busy} submit={(scope) => create("sessions", scope)} />
      </Card>
      <Card title="Phone capabilities">
        <p>The phone reports supported operations and whether strong biometric consent is available. A broker session alone does not authorize the phone.</p>
        <button className="button button--secondary" disabled={!canCall || !selectedSession?.operations.includes("describe")} onClick={() => call("describe", {})}>Check phone capabilities</button>
        {description ? <div className="phone-scope"><p>Methods: {description.methods?.join(", ") || "Not reported"}</p><p><ShieldCheck size={16} />{description.capabilities?.biometricConsent ? "Strong biometric consent available. General app actions still need phone approval." : "General app actions unavailable: strong biometric consent is unavailable or not reported."}</p><p>Screenshot support: {description.capabilities?.screenshots ? "Available, with opt-in below" : "Unavailable or not reported"}</p></div> : <p className="form-note">Capabilities have not been checked for this session.</p>}
        {busy && <p role="status">Waiting for a phone receipt. Check the companion for its biometric prompt. Stop remains available.</p>}
      </Card>
    </div>
    <Card title="Phone tasks">
      <p>One workflow controls the phone at a time. Task status refreshes every five seconds while this page is visible. Action counts record dispatch attempts; they do not prove the task succeeded.</p>
      <p>Manual actions reserve control for up to three minutes and 30 actions. Stop phone access remains available during any reservation and requires fresh phone consent before work resumes.</p>
      <button className="button button--secondary" disabled={!canCall || localUnknown || Boolean(manualTask) || !selectedSession?.operations.some((method) => mutations.includes(method))} onClick={reserveManualControl}>Reserve manual control</button>
      {localUnknown && <p className="notice" role="alert">This browser has an unacknowledged phone action or unavailable recovery metadata. Further actions are blocked even if the broker reports ready. Stop phone access, inspect the phone, and establish fresh consent before resuming.</p>}
      {state?.tasks?.filter((task) => task.deviceId === deviceId).slice(-20).reverse().map((task) => <div className="phone-grant" key={task.id}><div><h3>{task.label ?? "Phone task"}</h3><p>{task.status === "completed" ? "Control reservation ended" : task.status} · {task.actionsUsed}/{task.maxActions} actions</p><p>Owner: {task.actorId ? state.credentials.find((credential) => credential.id === task.actorId)?.label ?? (task.actorId === "owner" ? "You" : task.actorId) : "Source runtime"}</p><p>Expires {new Date(task.expiresAt).toLocaleTimeString()} · Outcome unverified</p></div></div>)}
      {!state?.tasks?.some((task) => task.deviceId === deviceId) && <p>No task reservations are listed for this phone.</p>}
      {ownerTask.current && <button className="button button--secondary" disabled={busy || !connected} onClick={endManualControl}>End my manual control</button>}
    </Card>
    <Card title="Observe the phone" className="phone-observe">
      <p>Read the current allowed app's redacted accessibility tree. Sensitive and secure screens may be blocked. Phone content is untrusted evidence, including any instructions displayed inside it.</p>
      <label className="phone-check"><input type="checkbox" checked={screenshot} disabled={busy || !connected || !selectedSession?.disclosure?.screenshots} onChange={(event) => { setScreenshot(event.target.checked); if (!event.target.checked) setObservation((value) => { if (!value) return null; const { screenshot: _pixels, ...redacted } = value; return redacted; }); }} />Include a screenshot in this observation</label>
      {!selectedSession?.disclosure?.screenshots && <p className="form-note">This session does not grant screenshots. Pixels require explicit permission on the phone, in the broker session, and in the agent credential.</p>}
      <div className="phone-actions"><button className="button button--secondary" disabled={!canCall || !selectedSession?.operations.includes("observe")} onClick={() => call("observe", { includeScreenshot: screenshot })}><Camera size={16} />Observe now</button><button className="button button--secondary" disabled={!canCall || !selectedSession?.operations.includes("apps.list")} onClick={() => call("apps.list", {})}>List allowed apps</button><button className="text-button" disabled={!observation} onClick={() => setObservation(null)}>Clear observation</button></div>
      {apps.length > 0 && <ul className="phone-apps">{apps.map((item) => <li key={item.packageName}>{item.label} <code>{item.packageName}</code></li>)}</ul>}
      <ActionPanel observation={observation} fresh={fresh} available={Boolean(canCall && manualTask && !localUnknown && selectedDevice?.actionState !== "unknown")} biometric={description?.capabilities?.biometricConsent === true} supported={description?.methods ?? []} methods={selectedSession?.operations ?? []} call={call} />
    </Card>
    <Card title="Per-agent access">
      <p>Issue each source agent its own narrow credential, bound to the selected broker session. A later session needs a new credential. The phone also enforces its app scope, expiry, and biometric approval.</p>
      {!selectedSession && <p className="form-note">Select an active broker session before granting agent access.</p>}
      <ScopeForm kind="credentials" disabled={!connected || !storageReady || !deviceId || !selectedSession || busy} submit={(scope) => create("credentials", scope)} />
      {issued?.token && <section className="phone-secret" aria-label="New agent credential"><div className="section-heading"><h3>Save this credential once</h3><button className="icon-button" aria-label="Dismiss and clear credential" onClick={() => { setIssued(null); setRevealed(false); }}><X size={18} /></button></div><p>This scoped agent token is shown only now. Store it in the agent's private configuration on the computer.</p><label className="phone-label">New agent token<input readOnly type={revealed ? "text" : "password"} autoComplete="off" value={issued.token} /></label><div className="phone-actions"><button className="button button--secondary" onClick={async () => { try { await navigator.clipboard.writeText(issued.token!); notify("Agent credential copied. Store it securely."); } catch { notify("Clipboard unavailable. Reveal and copy the token manually.", "error"); } }}><Copy size={16} />Copy agent token</button><button className="text-button" onClick={() => setRevealed(!revealed)}>{revealed ? "Hide token" : "Reveal token"}</button></div></section>}
      <div className="phone-grants">{state?.credentials.map((item) => <div className="phone-grant" key={item.id}><div><h3>{item.label}</h3><p>Devices: {item.devices.join(", ")}</p><p>Sessions: {item.sessionIds?.join(", ") ?? "Any matching active session (legacy grant)"}</p><p>Apps: {item.apps.join(", ")}</p><p>Operations: {item.operations.join(", ")}</p><p>{item.revokedAt ? "Revoked" : `Expires ${new Date(item.expiresAt).toLocaleString()}`}</p></div><button className="button phone-danger" disabled={!connected || stopping || !active(item)} onClick={() => revoke("credentials", item.id)}>Revoke {item.label}</button></div>)}</div>
      {!state?.credentials.length && <p className="form-note">No agent credentials are listed.</p>}
    </Card>
    <Card title="Action receipts">
      <p><strong>Observed</strong> records source evidence. <strong>Completed</strong> means dispatch completed; it does not verify the outcome. <strong>Unknown</strong> requires inspection before another action. Requests are never retried automatically.</p>
      {receipts.length > 0 && <ol className="phone-receipts">{receipts.map((item) => <li key={item.id}><div><strong>{item.method}</strong><StatusPill state={item.status} /><time dateTime={item.at}>{new Date(item.at).toLocaleTimeString()}</time></div><small>Receipt {item.id}</small>{item.error && <p>{item.error.message}</p>}</li>)}</ol>}
      <details><summary>Broker audit events ({state?.events.length ?? 0})</summary><ul className="phone-receipts">{state?.events.slice(-100).reverse().map((item, index) => <li key={`${item.at}-${index}`}><div><strong>{item.method ?? "Access change"}</strong><StatusPill state={item.status} /><time>{new Date(item.at).toLocaleString()}</time></div><small>{item.actorId}{item.deviceId ? ` · ${item.deviceId}` : ""}{item.code ? ` · ${item.code}` : ""}</small></li>)}</ul></details>
      {!receipts.length && <p className="form-note">No phone requests have been sent from this page.</p>}
    </Card>
  </div>;
}

function ScopeForm({ kind, disabled, submit }: { kind: "sessions" | "credentials"; disabled: boolean; submit(scope: ScopeInput): Promise<void> }) {
  const [apps, setApps] = useState("");
  const [operations, setOperations] = useState<Method[]>(["describe", "observe", "apps.list"]);
  const [minutes, setMinutes] = useState(10);
  const [label, setLabel] = useState("");
  const [screenshots, setScreenshots] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    const packages = [...new Set(apps.split(/[\s,]+/).filter(Boolean))];
    if (!packages.length || packages.length > 32 || packages.some((name) => !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(name))) { setError("Enter exact Android package names, separated by spaces or commas. Wildcards are not allowed."); return; }
    if (!operations.length) { setError("Choose at least one operation."); return; }
    setError(""); await submit({ apps: packages, operations, disclosure: { screenshots }, ttlSeconds: minutes * 60, label });
  }
  return <details className="phone-scope-form"><summary>{kind === "sessions" ? "Create a scoped broker session" : "Issue an agent credential"}</summary><form onSubmit={save}><fieldset disabled={disabled}>
    {kind === "credentials" && <label className="phone-label">Agent label<input required maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Research agent" /></label>}
    <label className="phone-label">{kind === "sessions" ? "Session allowed packages" : "Agent allowed packages"}<textarea required rows={2} maxLength={6500} value={apps} onChange={(event) => setApps(event.target.value)} placeholder="org.example.notes" /></label>
    <label className="phone-label">{kind === "sessions" ? "Session duration in minutes" : "Credential duration in minutes"}<input type="number" required min={1} max={kind === "sessions" ? 60 : 1440} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label>
    <label className="phone-check"><input type="checkbox" checked={screenshots} onChange={(event) => setScreenshots(event.target.checked)} />{kind === "sessions" ? "Allow screenshots in this session" : "Allow this agent to receive screenshots"}</label>
    <fieldset className="phone-methods"><legend>Allowed operations</legend>{methods.map((item) => <label className="phone-check" key={item}><input type="checkbox" checked={operations.includes(item)} onChange={(event) => setOperations((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} />{item}{item === "fixture.increment" ? " · fixture counter only" : mutations.includes(item) ? " · phone approval" : ""}</label>)}</fieldset>
    <p className="form-note">The observe operation shares screen text from these apps. Screenshots require separate opt-in. Create a new narrower scope and revoke the old one to change access.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button--primary">{kind === "sessions" ? "Create broker session" : "Create scoped agent token"}</button>
  </fieldset></form></details>;
}

function ActionPanel({ observation, fresh, available, biometric, supported, methods: allowed, call }: { observation: Observation | null; fresh: boolean; available: boolean; biometric: boolean; supported: Method[]; methods: Method[]; call(method: Method, params: Record<string, unknown>): Promise<void> }) {
  const [method, setMethod] = useState<Method>("tap");
  const [x, setX] = useState(0); const [y, setY] = useState(0);
  const [endX, setEndX] = useState(0); const [endY, setEndY] = useState(0);
  const [duration, setDuration] = useState(500); const [scale, setScale] = useState(1.5);
  const [text, setText] = useState(""); const [nodeId, setNodeId] = useState("");
  const [direction, setDirection] = useState("forward");
  const [key, setKey] = useState("back"); const [packageName, setPackageName] = useState("");
  const touchBounds = observation?.touchBounds ?? { left: 0, top: 0, right: observation?.width ?? 0, bottom: observation?.height ?? 0 };
  const hasTouchArea = touchBounds.right > touchBounds.left && touchBounds.bottom > touchBounds.top;
  const coordinateAction = ["tap", "longPress", "swipe", "pinch"].includes(method);
  const inside = (px: number, py: number) => px >= touchBounds.left && py >= touchBounds.top && px < touchBounds.right && py < touchBounds.bottom;
  const coordinate = (px: number, py: number) => Number.isInteger(px) && Number.isInteger(py) && inside(px, py);
  const pinchExtent = Math.fround(Math.fround(Math.min(observation?.width ?? 0, observation?.height ?? 0) * Math.fround(0.1)) * Math.max(1, Math.fround(scale)));
  const validTouch = !coordinateAction || hasTouchArea && coordinate(x, y) && (method !== "swipe" || coordinate(endX, endY))
    && (method !== "pinch" || inside(Math.fround(x - pinchExtent), y) && inside(Math.fround(x + pinchExtent), y));
  const canSend = available && supported.includes(method) && (biometric || method === "fixture.increment") && allowed.includes(method) && (method === "app.launch" || fresh);
  useEffect(() => { setNodeId(""); setText(""); }, [observation?.observationId]);
  async function send(event: FormEvent) {
    event.preventDefault(); if (!canSend || !validTouch || method === "pinch" && scale === 1) return;
    const base = { observationId: observation?.observationId };
    const params = method === "fixture.increment" ? base : method === "node.click" ? { ...base, nodeId } : method === "node.scroll" ? { ...base, nodeId, direction } : method === "app.launch" ? { packageName } : method === "tap" ? { ...base, x, y } : method === "longPress" ? { ...base, x, y, durationMs: duration } : method === "swipe" ? { ...base, points: [{ x, y }, { x: endX, y: endY }], durationMs: duration } : method === "pinch" ? { ...base, centerX: x, centerY: y, scale, durationMs: duration } : method === "type" ? { ...base, nodeId, text } : { ...base, key };
    setText(""); await call(method, params);
  }
  return <div className="phone-pilot">
    <div className="phone-evidence">
      {observation?.touchBounds && <p className="notice">{hasTouchArea ? `Safe touch area: X ${touchBounds.left}–${touchBounds.right - 1}, Y ${touchBounds.top}–${touchBounds.bottom - 1}. Android reserves the edges outside this area.` : "The phone reports no safe coordinate touch area. Element actions remain subject to their own phone checks."}</p>}
      {observation ? <><div className="phone-scope"><p><strong>{observation.packageName || "No app reported"}</strong></p><p>Captured <time dateTime={observation.capturedAt}>{new Date(observation.capturedAt).toLocaleString()}</time> · {fresh ? "Fresh for up to 30 seconds" : "Stale or blocked; observe again"}</p><p>{observation.width} × {observation.height} · window {observation.windowId}</p></div>{observation.blockedReason && <p className="notice" role="alert">Observation blocked: {observation.blockedReason}</p>}
        {observation.screenshot && <figure><img className="phone-screen" alt={`Observed ${observation.packageName} screen. Use coordinate inputs to prepare an action.`} src={`data:image/png;base64,${observation.screenshot.base64}`} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); setX(Math.min(observation.width - 1, Math.max(0, Math.floor((event.clientX - bounds.left) / bounds.width * observation.width)))); setY(Math.min(observation.height - 1, Math.max(0, Math.floor((event.clientY - bounds.top) / bounds.height * observation.height)))); }} /><figcaption>Click the image to select coordinates. Submit the action separately, then approve it on the phone.</figcaption></figure>}
        <details><summary>Redacted accessibility tree ({observation.nodes.length} nodes)</summary><ul className="phone-tree">{observation.nodes.map((node) => <li key={node.id}><code>{node.id}</code><span>{node.text || node.description || node.hintText || "Unlabelled element"}</span><small>{node.enabled === false ? "Disabled - " : ""}{node.checkable ? `Checkbox ${node.checkedState ?? "unknown"} - ` : ""}{node.scrollable ? "Scrollable - " : ""}{node.editable ? "Editable · " : ""}{node.clickable ? "Clickable · " : ""}{node.bounds.left}, {node.bounds.top}–{node.bounds.right}, {node.bounds.bottom}</small></li>)}</ul></details></> : <p className="phone-empty">No screen content loaded. Choose a session and observe when ready.</p>}
    </div>
    <form className="phone-action-form" onSubmit={send}><h3>Prepare one action</h3><p>General app actions need biometric approval on the phone. The signed test fixture's counter can increment only with a separate local fixture grant. After dispatch, observe again.</p>
      <label className="phone-label">Action<select value={method} onChange={(event) => setMethod(event.target.value as Method)}>{mutations.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <fieldset disabled={!canSend}>
        {method === "fixture.increment" ? <p className="form-note">Adds one to the signed fixture's counter. It cannot tap, type, launch apps, or perform another operation.</p> : method === "app.launch" ? <label className="phone-label">App package to launch<input value={packageName} required maxLength={200} onChange={(event) => setPackageName(event.target.value)} placeholder="org.example.notes" /></label> : method === "node.scroll" ? <><label className="phone-label">Scroll direction<select value={direction} onChange={(event) => { setDirection(event.target.value); setNodeId(""); }}><option value="forward">Forward</option><option value="backward">Backward</option></select></label><label className="phone-label">Scrollable element<select required value={nodeId} onChange={(event) => setNodeId(event.target.value)}><option value="">Choose an observed scrollable element</option>{observation?.nodes.filter((node) => node.enabled === true && node.scrollable && node.actions?.includes(direction === "forward" ? "scrollForward" : "scrollBackward")).map((node) => <option key={node.id} value={node.id}>{node.text || node.description || node.resourceId || node.id}</option>)}</select></label></> : method === "node.click" ? <label className="phone-label">Clickable element<select value={nodeId} onChange={(event) => setNodeId(event.target.value)} required><option value="">Choose an observed clickable element</option>{observation?.nodes.filter((node) => node.clickable && node.enabled !== false).map((node) => <option key={node.id} value={node.id}>{node.text || node.description || node.id}</option>)}</select></label> : method === "type" ? <><label className="phone-label">Editable element<select value={nodeId} onChange={(event) => setNodeId(event.target.value)} required><option value="">Choose an observed editable element</option>{observation?.nodes.filter((node) => node.editable && node.enabled !== false).map((node) => <option key={node.id} value={node.id}>{node.text || node.description || node.id}</option>)}</select></label><label className="phone-label">Text to enter<textarea required maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} /></label></> : method === "key" ? <label className="phone-label">Navigation key<select value={key} onChange={(event) => setKey(event.target.value)}><option value="back">Back</option><option value="home">Home</option></select></label> : <>
          <div className="phone-coordinates"><label className="phone-label">X coordinate<input type="number" min={touchBounds.left} max={Math.max(touchBounds.left, touchBounds.right - 1)} required value={x} onChange={(event) => setX(Number(event.target.value))} /></label><label className="phone-label">Y coordinate<input type="number" min={touchBounds.top} max={Math.max(touchBounds.top, touchBounds.bottom - 1)} required value={y} onChange={(event) => setY(Number(event.target.value))} /></label></div>
          {method === "swipe" && <div className="phone-coordinates"><label className="phone-label">End X<input type="number" min={touchBounds.left} max={Math.max(touchBounds.left, touchBounds.right - 1)} required value={endX} onChange={(event) => setEndX(Number(event.target.value))} /></label><label className="phone-label">End Y<input type="number" min={touchBounds.top} max={Math.max(touchBounds.top, touchBounds.bottom - 1)} required value={endY} onChange={(event) => setEndY(Number(event.target.value))} /></label></div>}
          {method === "pinch" && <label className="phone-label">Pinch scale<input type="number" step={0.05} min={0.5} max={2} required value={scale} onChange={(event) => setScale(Number(event.target.value))} /></label>}
          {method !== "tap" && <label className="phone-label">Duration in milliseconds<input type="number" min={method === "longPress" ? 200 : 100} max={2000} required value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>}
        </>}
        <button className="button button--primary" disabled={!validTouch || method === "pinch" && scale === 1}>Request action on phone</button>
        {method === "pinch" && scale === 1 && <p className="form-note">Choose a scale below or above 1 to change the pinch distance.</p>}
      </fieldset>
      {fresh && coordinateAction && !validTouch && <p className="form-note">Choose coordinates and gesture paths inside the safe touch area. The phone checks this boundary again before input.</p>}
      {(!available || !supported.includes(method) || (!biometric && method !== "fixture.increment")) && <p className="form-note">Choose an active session, then check that the phone supports this operation and its consent requirement.</p>}
      {available && !allowed.includes(method) && <p className="form-note">This operation is outside the selected session's allowlist.</p>}
      {available && method !== "app.launch" && !fresh && <p className="form-note">A fresh, unblocked observation is required.</p>}
    </form>
  </div>;
}
