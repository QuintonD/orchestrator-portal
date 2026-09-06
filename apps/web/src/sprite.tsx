import type { CSSProperties } from "react";
import { iconThemes, type IconTheme } from "./icon-themes.js";
import { cx } from "./lib.js";

export function AssistantSprite({ theme, row, active = false }: { theme: IconTheme; row: number; active?: boolean }) {
  const set = iconThemes.find((item) => item.id === theme) ?? iconThemes[0];
  return <span aria-hidden="true" className={cx("assistant-sprite", active && "is-working")} data-icon-theme={set.id} data-icon-row={row}
    style={{ "--sprite-url": `url("${set.file}")`, "--sprite-row": `${row * 100 / 3}%` } as CSSProperties} />;
}
