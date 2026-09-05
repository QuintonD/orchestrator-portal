import { test } from "node:test";
import assert from "node:assert/strict";
import { desktopDataDir, desktopPort } from "./paths.mjs";

test("desktop data paths are stable across operating systems and ignore relative XDG paths", () => {
  assert.equal(desktopDataDir("win32", { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" }, "C:\\Users\\Ada"), "C:\\Users\\Ada\\AppData\\Local\\Orchestrator");
  assert.equal(desktopDataDir("darwin", {}, "/Users/ada"), "/Users/ada/Library/Application Support/Orchestrator");
  assert.equal(desktopDataDir("linux", { XDG_DATA_HOME: "/private/data" }, "/home/ada"), "/private/data/orchestrator");
  assert.equal(desktopDataDir("linux", { XDG_DATA_HOME: "relative" }, "/home/ada"), "/home/ada/.local/share/orchestrator");
  assert.equal(desktopDataDir("linux", { ORCHESTRATOR_DATA_DIR: "/workspace" }, "/home/ada"), "/workspace");
  assert.throws(() => desktopDataDir("linux", { ORCHESTRATOR_DATA_DIR: "relative" }, "/home/ada"), /absolute/);
  assert.throws(() => desktopDataDir("win32", { LOCALAPPDATA: "relative" }, "C:\\Users\\Ada"), /absolute/);
  assert.throws(() => desktopDataDir("win32", { ORCHESTRATOR_DATA_DIR: "\\workspace" }, "C:\\Users\\Ada"), /absolute/);
  assert.throws(() => desktopDataDir("win32", { LOCALAPPDATA: "\\workspace" }, "C:\\Users\\Ada"), /absolute/);
  assert.equal(desktopDataDir("win32", { ORCHESTRATOR_DATA_DIR: "\\\\server\\share\\workspace" }, "C:\\Users\\Ada"), "\\\\server\\share\\workspace");
  assert.throws(() => desktopDataDir("linux", {}, "relative-home"), /absolute/);
  assert.throws(() => desktopDataDir("darwin", {}, "relative-home"), /absolute/);
});

test("desktop port rejects ambiguous and out-of-range configuration", () => {
  assert.equal(desktopPort("4400"), 4400);
  for (const value of ["0", "65536", "44oops", "4.4", "-1", "", " 4400", "1e3"]) assert.throws(() => desktopPort(value), /whole number/);
});
