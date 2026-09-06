import { cx } from "./lib.js";
import { useIconAppearance } from "./icon-appearance.js";
import { iconRow } from "./icon-themes.js";
import { AssistantSprite } from "./sprite.js";

// Stable identities remain recognizable when the list is sorted or filtered.
export function AssistantSigil({ name, state = "ready", icon }: { name: string; state?: string; icon?: number | undefined }) {
  const { theme } = useIconAppearance();
  return <span className="assistant-sigil" aria-hidden="true"><AssistantSprite theme={theme} row={icon ?? iconRow(name)} active={state === "running"} /></span>;
}

export function PresenceField({ active = false }: { active?: boolean }) {
  return <div className={cx("presence-field", active && "is-working")} aria-hidden="true">
    <img src="/assets/presence.png" alt="" />
    <svg viewBox="0 0 280 200" fill="none"><g className="presence-links" stroke="currentColor" strokeWidth=".5"><path d="M140 100 53 48M140 100 232 57M140 100 220 155M140 100 67 166" /></g><g fill="currentColor"><circle cx="53" cy="48" r="2" /><circle cx="232" cy="57" r="2.5" /><circle cx="220" cy="155" r="1.5" /><circle cx="67" cy="166" r="2" /></g></svg>
  </div>;
}
