# Desktop gateway

The desktop bundle runs Orchestrator on your computer and opens it in your browser. It includes Node.js; you do not need to install Node, npm, Git, Docker, or an administrator-level service. Your assistants and knowledge sources remain separate connections.

Download the archive for your computer from the [alpha 4 release](https://github.com/QuintonD/orchestrator-portal/releases/tag/v0.1.0-alpha.4). A source-code ZIP or the Android APK is not the desktop gateway. The **Desktop gateway** GitHub Actions workflow builds and tests each native target; maintainer workflow artifacts contain the same archive format.

## Start

1. Choose the archive matching your computer below and extract it completely into a folder you own. If downloading a GitHub Actions artifact, extract the artifact ZIP, then extract the Orchestrator archive inside it.
2. Open the launcher. Keep its window open while using Orchestrator.
3. Your browser opens to `http://127.0.0.1:4400`. Create your local workspace and passphrase, then add a connection.

| Computer | Archive target | Launcher |
| --- | --- | --- |
| Windows, Intel or AMD | `win32-x64.zip` | Double-click `Orchestrator.cmd` |
| Windows on ARM | `win32-arm64.zip` | Double-click `Orchestrator.cmd` |
| Mac, Apple silicon | `darwin-arm64.tar.gz` | Open `Orchestrator.command` |
| Mac, Intel | `darwin-x64.tar.gz` | Open `Orchestrator.command` |
| Linux, Intel or AMD | `linux-x64.tar.gz` | Run `./orchestrator` in a terminal |
| Linux, ARM64 | `linux-arm64.tar.gz` | Run `./orchestrator` in a terminal |

These are portable scripts, not signed OS installers. macOS or Windows may ask you to review a downloaded launcher before opening it. Follow your organization's software policy; do not disable system-wide security checks. Linux packages use the official glibc Node build, not an Alpine/musl build. The [Node 24 platform requirements](https://github.com/nodejs/node/blob/v24.19.0/BUILDING.md#platform-list) define the runtime's supported operating systems.

If the browser does not open, enter the printed local address yourself. The computer must remain awake and the launcher must remain running for phone access to work. Closing only the browser does not stop the gateway.

To stop, type `stop` and press Enter in the launcher window, or press Ctrl+C. You can also run the launcher with the `stop` argument from another terminal. Your workspace stays saved. A second launch opens the existing workspace only after verifying that the running process belongs to this launcher.

## Workspace files and upgrades

The launcher prints the workspace directory. It is separate from the downloaded program:

| OS | Default directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Orchestrator` |
| macOS | `~/Library/Application Support/Orchestrator` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/orchestrator` |

The directory contains the SQLite database, its encryption key, and a temporary launcher lock. Protect it as private data. The lock includes a local stop capability; diagnostic output never includes it. Never share `master.key`, `desktop.lock`, or a raw database in a bug report.

For an upgrade, stop Orchestrator, back up the entire workspace directory, extract the new program into a new folder, and launch it. The new version uses the same workspace. Keep the backup and previous program until you have checked the upgrade. Database downgrade compatibility is not guaranteed. There is no automatic updater, login startup, or background service in this bundle.

Deleting an extracted program folder does not delete the workspace. This package has no command that deletes workspace data. `recover` removes only a stale launcher lock after checking that its recorded process has exited.

An existing source installation continues to use its original data path. To use that workspace with the desktop bundle, stop the old gateway and set `ORCHESTRATOR_DATA_DIR` to its absolute data-directory path before launch. Never run two gateways against the same directory. Keep the same external `ORCHESTRATOR_MASTER_KEY` if you previously supplied one; the bundle does not migrate or replace keys.

## Agent and terminal operation

Run these commands from the extracted program directory. On Windows, substitute `.\Orchestrator.cmd` for `./orchestrator`.

```sh
./orchestrator start --no-open --json
./orchestrator status --json
./orchestrator doctor --json
./orchestrator stop --json
```

`start` stays in the foreground. Each launcher event is one JSON object per line when `--json` is supplied; HTTP access logs are suppressed. `status` succeeds only for a verified running instance. `doctor` checks packaged files, runtime, workspace access, the port, and launcher state without creating a workspace or starting the gateway. Failures return a nonzero exit code and an actionable message. These checks cover the gateway, not the health of every optional assistant runtime.

The optional `ORCHESTRATOR_PORT` must be a whole number from 1 to 65535. `ORCHESTRATOR_DATA_DIR` must be absolute. Set environment variables in the terminal that starts the launcher; the bundle does not load `.env` files. For example:

```powershell
$env:ORCHESTRATOR_PORT = '4401'
.\Orchestrator.cmd
```

```sh
ORCHESTRATOR_PORT=4401 ./orchestrator
```

The desktop launcher binds only to `127.0.0.1` and refuses demo mode. For another device, use the existing [private HTTPS deployment path](https://github.com/QuintonD/orchestrator-portal/blob/main/docs/deployment.md) and set the exact `ORCHESTRATOR_ALLOWED_ORIGINS` before restarting. No firewall exception or public listener is created automatically.

If a port is occupied by an unrelated service, the launcher reports the conflict and does not open that service in your browser. Stop its owner or choose a different port. After an unexpected computer or process shutdown, run `doctor`; if it reports an exited process with a stale lock, run `./orchestrator recover` and then start again. Recovery refuses to remove the lock of a process that still exists, including an unverified process; inspect that process before proceeding.

OpenClaw and other local command adapters still need their own source runtime installed and configured. An API or webhook connection does not require a local CLI. Launching the portal never installs a source runtime or reads its private credentials automatically.

## Build and verify

Maintainers need Node 24, npm, and the native `tar` command. From a clean checkout:

```sh
npm ci
npm run desktop:test
npm run desktop:package
npm run desktop:smoke
```

The packager accepts a target, for example `npm run desktop:package -- win32-arm64`. Build Windows archives on Windows. CI builds and executes all six targets on matching native runners; the smoke command deliberately rejects an archive for another architecture. [GitHub's runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) lists the matrix labels.

The build uses an isolated `npm ci --omit=dev --ignore-scripts` installation from the repository lockfile. It copies only compiled application files, production dependencies, launcher files, and notices. Local databases, keys, untracked assets, development dependencies, and application source maps are excluded. The downloaded official Node archive must match the reviewed SHA-256 in `scripts/desktop/runtime.json`; mismatches stop packaging. To update Node, review the version's official `SHASUMS256.txt`, update all pinned hashes, and rerun the native matrix.

Output appears in `dist/desktop/`: one archive and its `.sha256` checksum. Each archive includes `FILES.sha256`, `bundle.json`, the pinned runtime manifest, and license notices. The checksums establish consistency with the supplied manifest; download them through a trusted release or workflow source. No release is published by the desktop workflow.

The smoke test extracts the actual archive into a path containing spaces, launches its native entry point from another working directory with system Node/npm/Git blocked, checks files and assets, creates a private workspace, verifies duplicate and stop behavior, restarts to check persistence, and rejects conflicting ports and invalid configuration. Its report records the OS/architecture actually executed. It does not verify OS download-trust dialogs or browser-launch integration on a user's desktop.
