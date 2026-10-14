# Architecture

How My Island is put together: the two processes, the windows, how data moves between Rust and React, and where things are stored.

- [1. The big picture](#1-the-big-picture)
- [2. Windows and processes](#2-windows-and-processes)
- [3. Backend (Rust, `src-tauri/`)](#3-backend-rust-src-tauri)
- [4. Frontend (React, `src/`)](#4-frontend-react-src)
- [5. Talking between the two](#5-talking-between-the-two)
- [6. Click-through and hover](#6-click-through-and-hover)
- [7. The agent endpoint (Claude Code hooks)](#7-the-agent-endpoint-claude-code-hooks)
- [8. Persistence and data locations](#8-persistence-and-data-locations)
- [9. Test-build enforcement (`beta.rs`)](#9-test-build-enforcement-betars)
- [10. Performance rules](#10-performance-rules)
- [11. Adding a new module](#11-adding-a-new-module)

---

## 1. The big picture

```
┌────────────────────────── Windows 10/11 ──────────────────────────┐
│                                                                    │
│  ┌───────────── Rust process (src-tauri) ─────────────┐            │
│  │  Tauri runtime · tray · global shortcuts           │            │
│  │  Native Windows APIs (GSMTC, volume, battery,      │            │
│  │  notifications, OLE drop target, window placement) │            │
│  │  Agent HTTP endpoint 127.0.0.1:47823               │            │
│  │  Store (island.json) · beta enforcement            │            │
│  └───────▲─────────────────────────▲──────────────────┘            │
│          │ invoke() / events        │ invoke() / events             │
│  ┌───────┴──────── WebView2 ──────┴───────┐  ┌── WebView2 ──┐      │
│  │ "main" window: the island (React)       │  │ "buddy" win  │      │
│  │ full-width, transparent, click-through  │  │ desktop pet  │      │
│  └─────────────────────────────────────────┘  └──────────────┘      │
└────────────────────────────────────────────────────────────────────┘
```

The app is one Rust process that hosts two small WebView2 windows, plus native Windows work that happens in Rust. The React code never touches Windows APIs directly; it asks Rust through typed commands and listens for events.

## 2. Windows and processes

| Window | Label | What it is | Created at |
|---|---|---|---|
| The island | `main` | Full-width, transparent, always-on-top strip at the top-centre of the primary monitor. Everything that expands lives here. | Startup (`tauri.conf.json`) |
| The desktop pet | `buddy` | A small transparent window the cat/dog uses when it is "out" on your desktop. | On demand (`buddy_prepare` / `buddy_open`) |

Design decisions that matter:

- **The island window never resizes.** It is created at its largest size and only its content animates. Resizing a WebView2 window on every expand causes visible flicker, so `AppState.compact` defaults to `false`.
- **Windows are never hidden.** Tauri tracks visibility, and hiding and re-showing a window from Rust caused the pet to disappear for good in early builds. The buddy is instead *parked* off-screen at `(-32000, -32000)` and destroyed after 120 seconds parked. Minimizing the island is done in React (a slim bar), not with `hide()`.
- **Screen-share privacy** uses `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` on each window (`window.rs`, `set_capture_privacy`), so the island and/or pet can be hidden from Teams, Zoom or OBS captures without being hidden from you.

## 3. Backend (Rust, `src-tauri/`)

`src-tauri/src/` contains 19 modules. What each one owns:

| Module | Responsibility |
|---|---|
| `main.rs` | Entry point; calls `lib::run()`. |
| `lib.rs` | Builds the Tauri app: plugins (single-instance, store, dialog, opener, clipboard, autostart, global-shortcut), tray menu, global shortcuts, startup hooks, and the full `invoke_handler` list. **Start here to find any command.** |
| `state.rs` | `AppState`: hit-test targets, compact flag, buddy flags and launch data, notification and capture-privacy flags. Shared behind a lock, used by all modules. |
| `window.rs` | Placing and sizing the island, `set_visible` (without hiding), `set_capture_privacy`, `idle_seconds` (from `GetLastInputInfo`). |
| `hit.rs` | Click-through. A poll loop checks the cursor against each window's interactive rectangles and toggles `set_ignore_cursor_events`. Emits `island://hover` and `buddy://hover`, and streams `buddy://cursor` when the pet's eyes follow the cursor. |
| `drop.rs` | A native OLE `IDropTarget` on the island. Accepts files, links and text dragged from other apps. Needed because WebView2's own drop handling doesn't deliver file paths. |
| `files.rs` | File-system helpers for the stash (stores paths, never copies files). |
| `media.rs` | Now-playing via the Windows media session (GSMTC): track, artwork, transport controls. |
| `audio.rs` | System volume (`IAudioEndpointVolume`) for the scroll-to-change-volume gesture. |
| `stats.rs` | CPU, memory, battery, network and disk polling, pushed to the frontend. |
| `clipboard.rs` | Clipboard watcher for the stash history. Skips items marked as secrets by password managers. |
| `links.rs` | Link previews (title, description, image, favicon). The only deliberate outbound network request in the app. |
| `notifications.rs` | Mirrors Windows notifications via `UserNotificationListener`. |
| `calls.rs` | "On a call" detection from the CapabilityAccessManager registry (which apps are using mic/camera). |
| `fullscreen.rs` | Detects a fullscreen foreground app or game (checked every 900 ms) so the island can step aside. |
| `buddy.rs` | The desktop-pet window: open, park, move, drag, and the `Dropped` event that tells the island whether the pet was dropped on it. |
| `agents.rs` | The HTTP endpoint that receives Claude Code hook events, lenient JSON parsing (so Windows paths from Git Bash survive), and the commands that install/remove the hooks. |
| `winsrc.rs` | Finds the window an agent is running in (via TCP table, Toolhelp and `EnumWindows`), and focuses it when you click "Answer in…". |
| `beta.rs` | Test-build expiry, the registry clock guard, the remote off-switch, and the `beta_info` command. See [section 9](#9-test-build-enforcement-betars). |

### Global shortcuts (registered in `lib.rs`)

All use `Ctrl+Alt`: `Space` (toggle island), `V` (clipboard), `T` (quick-add task), `P` (play/pause), `B` (pet roams), `M` (minimize/restore).

## 4. Frontend (React, `src/`)

| Folder | Responsibility |
|---|---|
| `App.tsx`, `main.tsx` | Root. Loads persisted state, starts background sweepers and the Rust event listeners. |
| `island/` | The shell: `Island.tsx` (expand, collapse, hover, minimize, keyboard, drop handling), `Collapsed.tsx` (the pill with its activity), `Expanded.tsx` (the tab bar and the content area). |
| `modules/` | One folder per island tab: `home`, `media`, `todos`, `stash`, `timer`, `stats`, `alerts` (notifications and agent sessions), `wellness`, `pet`, `settings`. Each exports an `IslandModule` object. `registry.ts` lists them. |
| `pet/` | `PetSvg.tsx` draws the cat or dog procedurally in SVG (poses: idle, happy, proud, held, sleeping, and so on). `Pet.tsx` runs its animations and particles. |
| `buddy/` | `BuddyApp.tsx`, the React app for the desktop-pet window. |
| `state/` | Zustand stores, one per feature (`settings`, `stash`, `todos`, `agents`, `alerts`, `wellness`, `pet`, `timer`, `workspaces`, `island`, `live`, …). Each uses the `persist()` helper. |
| `ui/` | Shared pieces: `primitives.tsx` (`Button`, `Toggle`, `Popover`, `Menu`, `HScroll`, springs), `icons.tsx` (the icon set; no emoji), `workspaces.tsx` (the folder switcher), `Logo.tsx`, `ErrorBoundary.tsx`. |
| `lib/` | Framework-free helpers: `bridge.ts` (typed wrappers around `invoke` and `listen`), `persist.ts`, `quickAdd.ts` (natural-language task parser), `markdown.tsx`, `sound.ts`, `docTemplates.ts`, `bus.ts`. |
| `styles.css` | Design tokens and global rules (`.scroll`, `.fade-y`, `.tabular`). |

### The activity system

Each module's `useActivity` returns `{priority, left, center, right, width, opens, onClick}`. The collapsed pill shows the highest-priority activity: a running timer, a live agent, a media track, a wellness reminder, and so on. This is how the pill can show "Editing Island.tsx · 2:14" without the module knowing about the pill.

### Vite

`vite.config.ts` includes a small plugin that forces a full page reload on changes instead of hot module replacement. Partial HMR updates left the island blank in development, so this is deliberate.

## 5. Talking between the two

- **React → Rust:** `invoke("command_name", args)`. Commands are registered in `lib.rs` and wrapped in `src/lib/bridge.ts` so the rest of the frontend is typed.
- **Rust → React:** `app.emit("event://name", payload)`, received with `listen()`. Examples: `island://hover`, `buddy://cursor`, `buddy://hover`, the stats stream, media changes, notification and agent events.
- **Windows → Rust:** native callbacks (drop target, GSMTC change events) and polling loops, each documented at the top of its module.

## 6. Click-through and hover

The island window covers the top of the screen but almost all of it is transparent. Windows would normally send every click in that area to the island, which would block whatever is under it.

`hit.rs` solves this. The frontend reports the rectangles that are actually visible and interactive (pill, expanded panel, buttons). A poll loop reads the cursor position and sets `set_ignore_cursor_events(true)` when the cursor is outside those rectangles, so clicks pass through to the app underneath. The same rectangles drive `island://hover`, which is how hovering the pill expands it.

The pet window has its own rectangles and its own `buddy://hover` event. The two are kept separate on purpose: an early version let a hover over the pet expand the island.

## 7. The agent endpoint (Claude Code hooks)

`agents.rs` runs a tiny HTTP server on `127.0.0.1:47823`. Localhost only; nothing outside your machine can reach it.

**Connecting** (Settings or Alerts → "Connect Claude Code") writes six hooks into `~/.claude/settings.json` and keeps a backup of the previous file:

| Claude Code event | What the island shows |
|---|---|
| `UserPromptSubmit` | Session starts; your prompt is recorded. |
| `PreToolUse` | "Editing Island.tsx", "Running a command…" and so on. |
| `Notification` | "Needs your input". Clicking jumps to the source window. |
| `Stop` | Finished; the summary is built from the steps. |
| `SubagentStop` | Adds an entry to the session's steps. |
| `SessionEnd` | Closes the session (after the retention you choose). |

Each hook runs `curl -s -m 1 -X POST http://127.0.0.1:47823/notify … || exit 0`. The `|| exit 0` means that if My Island isn't running, Claude Code is unaffected.

Any other tool can post to the same endpoint, which is how the "any agent, not only Claude Code" support works:

```sh
curl -s -X POST http://127.0.0.1:47823/notify -d '{"source":"My agent","kind":"done","title":"Done","message":"Tests pass"}'
```

Background-task messages that Claude Code sends to itself (`<task-notification>…`) are recognised and treated as continuations, not as new prompts.

## 8. Persistence and data locations

| What | Where |
|---|---|
| All app data (stash, to-dos, folders, settings, pet, wellness, agent sessions, alerts) | `island.json` in the app-data folder, via `tauri-plugin-store`. Usually `%APPDATA%\dev.myisland.app\`. |
| Claude Code hooks | `%USERPROFILE%\.claude\settings.json` (plus a backup) |
| Test-build clock guard | Registry: `HKCU\Software\MyIsland\Beta`, value `LastSeen` |
| Installed program | `%LOCALAPPDATA%\Programs\My Island\` (per-user NSIS install, no admin rights needed) |

Each store in `src/state/` is a Zustand store wrapped in `persist()` (`src/lib/persist.ts`). The stored data has a version number, and migrations run when it changes. For example, settings went through three versions as the Home layout and retention options were added. A migration must never drop data a user has; if you add a field, give it a default and bump the version with a migration.

Nothing is sent anywhere except link previews (which you can turn off under Settings → Privacy).

## 9. Test-build enforcement (`beta.rs`)

Compiled into the binary by the build script via three environment variables read with `option_env!`:

| Variable | Meaning |
|---|---|
| `MY_ISLAND_BETA_EXPIRES` | `YYYY-MM-DD`. The build stops working at the **end** of that day (UTC). Absent = permanent. |
| `MY_ISLAND_BETA_URL` | Raw URL of a JSON file (a public GitHub Gist, see BUILDING-AND-SHARING.md). Absent = no remote off-switch. |
| `MY_ISLAND_FEEDBACK_URL` | Where Settings → About → "Send feedback" goes. |

At startup, and then every six hours while the app runs:

1. **Date check.** If the current time is past the expiry, a message box says the test has ended and the app exits.
2. **Clock guard.** The newest time seen is saved in the registry (`LastSeen`). If the clock is now more than a day *behind* that, the app refuses to run. Rolling the clock back doesn't revive an expired build.
3. **Off-switch.** If `MY_ISLAND_BETA_URL` is set, the app fetches it. If it says `"enabled": false`, the app shows its `message` and exits. If the fetch fails (offline, repo private, timeout), the date check still applies and the app keeps running.

**Be honest about the limit:** this is a courtesy mechanism for friends, not copy protection. Someone determined can delete the `LastSeen` registry value and set the clock back. Don't rely on it for anything you'd be upset to see leaked.

## 10. Performance rules

These are project rules, not suggestions. Each exists because of a measured problem.

- **No `scale` animations on content.** Scaling re-rasterises the text on the last frame, which looks like a flicker when expanding or collapsing. Use opacity, translate and colour only.
- **Constant shadows.** Animating `box-shadow` or `filter: blur` costs a lot of GPU and CPU on a transparent window.
- **The window never resizes** (section 2).
- **Pollers are cheap and bounded.** Fullscreen check every 900 ms; stats and media only while needed.
- **Idle CPU target:** about 2–5%. Memory is mostly WebView2 (around 300 MB in development); the Rust process is around 27 MB.
- **Release profile** uses thin LTO. **Dev profile** uses line-table-only debug info and `rust-lld`, so rebuilds are quick.
- `tauri.conf.json` passes WebView2 flags (`--max-old-space-size=96`, `--renderer-process-limit=1`, and switches that turn off background networking, sync and extensions) to keep memory down and avoid background network calls.

## 11. Adding a new module

1. Create `src/modules/<name>/index.tsx` and export an `IslandModule` (`id`, `title`, `icon`, `size`, `View`, `description`, and optionally `useActivity`).
2. Register it in `src/modules/registry.ts`.
3. If it has persisted data, add a store in `src/state/<name>.ts` using `persist()`, with a version and a migration.
4. If it needs Windows data, add a module in `src-tauri/src/`, register its commands in `lib.rs`'s `invoke_handler`, and add typed wrappers in `src/lib/bridge.ts`.
5. If it should be selectable on Home, add an entry to `WIDGETS` in `src/modules/home/index.tsx` and to `HomeWidgetId` in `src/state/settings.ts`.
6. Run `npm run typecheck`, then `npm run tauri dev` and test with the Home layout on and off.
