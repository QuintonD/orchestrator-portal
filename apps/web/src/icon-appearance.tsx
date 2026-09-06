import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { iconThemes, validIconTheme, type IconTheme } from "./icon-themes.js";
import { AssistantSprite } from "./sprite.js";

const storageKey = "orchestrator-icon-theme";
const Appearance = createContext({ theme: "symbols" as IconTheme, setTheme: (_theme: IconTheme) => {} });
export function IconAppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<IconTheme>(() => {
    try { return validIconTheme(localStorage.getItem(storageKey)); } catch { return "symbols"; }
  });
  useEffect(() => {
    // Preload the small atlases so switching sets does not briefly erase icons.
    for (const set of iconThemes) { const atlas = new Image(); atlas.src = set.file; }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(storageKey, theme); } catch { /* Keep session appearance usable when storage is blocked. */ }
  }, [theme]);
  useEffect(() => {
    const update = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) setTheme(validIconTheme(event.newValue)); };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  return <Appearance.Provider value={{ theme, setTheme }}>{children}</Appearance.Provider>;
}
export const useIconAppearance = () => useContext(Appearance);

export function IconThemePicker() {
  const { theme, setTheme } = useIconAppearance();
  const [preview, setPreview] = useState(false);
  return <div className="icon-theme-picker">
    <p>Choose a set for your assistants. Saved on this device.</p>
    <div className="icon-theme-options" role="group" aria-label="Assistant icon theme">
      {iconThemes.map((set) => <button key={set.id} className="icon-theme-option" aria-pressed={theme === set.id} onClick={() => setTheme(set.id)}>
        <span className="icon-theme-option__name">{set.name}<span>{theme === set.id ? "Selected" : ""}</span></span>
        <span className="icon-theme-samples">{set.icons.map((name, row) => <span key={name} title={name}><AssistantSprite theme={set.id} row={row} active={preview} /></span>)}</span>
      </button>)}
    </div>
    <div className="icon-preview-controls"><button className="button button--secondary" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Stop preview" : "Preview animation"}</button><span>Icons move during work. Reduced motion is respected.</span></div>
  </div>;
}
