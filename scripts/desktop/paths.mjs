import path from "node:path";
import os from "node:os";

export function desktopDataDir(platform = process.platform, env = process.env, home = os.homedir()) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const absolute = (value) => platform === "win32" ? /^(?:[a-zA-Z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/.test(value) : paths.isAbsolute(value);
  if (env.ORCHESTRATOR_DATA_DIR) {
    if (!absolute(env.ORCHESTRATOR_DATA_DIR)) throw new Error("ORCHESTRATOR_DATA_DIR must be an absolute path (including the drive on Windows) for desktop launches.");
    return paths.normalize(env.ORCHESTRATOR_DATA_DIR);
  }
  if (platform === "win32") {
    const base = env.LOCALAPPDATA || paths.join(home, "AppData", "Local");
    if (!absolute(base)) throw new Error("LOCALAPPDATA must be an absolute path including the drive or UNC share.");
    return paths.join(base, "Orchestrator");
  }
  if (platform === "darwin") {
    if (!absolute(home)) throw new Error("The home directory must be an absolute path.");
    return paths.join(home, "Library", "Application Support", "Orchestrator");
  }
  // The XDG specification says to ignore relative base directories.
  const base = env.XDG_DATA_HOME && paths.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : paths.join(home, ".local", "share");
  if (!absolute(base)) throw new Error("The home directory must be an absolute path.");
  return paths.join(base, "orchestrator");
}

export function desktopPort(value = process.env.ORCHESTRATOR_PORT ?? "4400") {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error("ORCHESTRATOR_PORT must be a whole number from 1 to 65535.");
  return Number(value);
}
