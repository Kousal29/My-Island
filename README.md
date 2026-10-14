# My Island

A Dynamic Island for Windows — a small pill that lives at the top of your screen, expands into now-playing controls, a to-do list, a file/link/clipboard stash, a focus timer and live system stats, and comes with a cat (or dog) you can pet, feed, and let loose on your desktop.

Built fresh with **Tauri 2 + Rust** and **React + TypeScript**, inspired by [notchidex.dev](https://notchidex.dev), [dynamic-island-for-windows](https://github.com/rajsriv/dynamic-island-for-windows) and [L4-Windows-NotchBar](https://github.com/Linux5Real/L4-Windows-NotchBar) — no code shared with any of them.

![platform](https://img.shields.io/badge/platform-Windows-0078D6) ![stack](https://img.shields.io/badge/stack-Tauri%202%20%2B%20React-24C8DB)

## Features

- **Island shell** — a pill or notch at the top-center of your screen that peeks on hover and expands on click, with spring animations, drag-and-drop, and per-monitor placement.
- **Now Playing** — reads any app that reports to the Windows media session (Spotify, browsers, VLC, Apple Music…): artwork, transport controls, seek bar, and scroll-to-change volume.
- **To-do** — multiple lists, priorities, due dates, subtasks, and a natural-language quick-add ("Pay rent tomorrow 9am !high #bills").
- **Stash** — a shelf for files (only the path is stored, never a copy), links (with fetched previews), clipboard history (auto-captured, secrets excluded), and rich docs with Markdown, checklists and templates.
- **Folders** — group stash items, docs, task lists and tasks into folders (e.g. "Personal", "Work", "Thesis") with subfolders, a breadcrumb, and Alt+1…9 shortcuts.
- **Customizable Home** — clock, pet and the widgets you pick (music, today's tasks, focus, system, water, agents, recent stash), drag to reorder.
- **Coding agents** — live Claude Code progress in the notch ("Editing Island.tsx · 2:14"), a "needs your input" state that jumps you to the right window, and finish summaries. Any agent or script can post to a local endpoint.
- **Notifications & calls** — mirrors Windows notifications (Teams, Outlook, Slack…) and shows an "On a call" indicator while a meeting app uses your mic/camera.
- **Wellness** — water tracker plus gentle stretch and 20-20-20 eye reminders, delivered by the cat.
- **Focus timer** — pomodoro-style sessions with a weekly chart.
- **System stats** — live CPU, memory, battery, network and disk, with sparkline history.
- **A pet** — a procedurally drawn cat or dog (no image assets) that reacts to what you do, levels up, and can be let out to roam, nap, and be dragged around your actual desktop.
- Runs quietly: click-through everywhere except the island itself, auto-hides in fullscreen apps/games, no network calls except the ones you trigger (link previews), no accounts, no analytics.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | [Tauri 2](https://tauri.app) (Rust) |
| UI | React 19 + TypeScript, Vite, Tailwind CSS 4 |
| Animation | [Motion](https://motion.dev) |
| State | Zustand, persisted through a versioned `persist()` helper (`tauri-plugin-store`) |
| Windows integration | `windows-rs` (media session, volume, battery, fullscreen detection, notifications, native OLE drag & drop) |

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the Rust backend and React frontend fit together: the two windows, click-through hit testing, the agent endpoint, where data is stored, performance rules, and how to add a module.
- **[docs/BUILDING-AND-SHARING.md](docs/BUILDING-AND-SHARING.md)** — building installers, the difference between test and permanent builds, the bundles, changing or ending a test period, instructions for testers, and troubleshooting.

## Getting started

### Prerequisites

- Windows 10 2004+ or Windows 11
- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) (stable, MSVC toolchain)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload
- WebView2 Runtime (preinstalled on most Windows 10/11 machines)

### Run in development

```sh
npm install
npm run tauri dev
```

The first build compiles the Rust dependencies and takes several minutes. Later frontend changes reload instantly, and Rust-only changes rebuild quickly thanks to the dev profile and linker settings in `src-tauri/`.

### Build a release binary

```sh
npm run tauri build
```

Produces both installer formats under `src-tauri/target/release/bundle/`: `nsis\` (the setup `.exe`) and `msi\`.

## Sharing with friends (test builds)

Use the build script rather than `npm run tauri build`. It produces a single setup `.exe` with the right expiry baked in:

```powershell
.\scripts\build-beta.ps1                          # test build, expires in 21 days
.\scripts\build-beta.ps1 -Expires 2026-12-01      # test build, explicit end date
.\scripts\build-beta.ps1 -NoExpiry                # permanent build
```

| You want… | You get |
|---|---|
| A test that **stops working** after a date | `My-Island-Test-until-2026-12-01.exe` |
| A **permanent** copy | `My-Island-Setup.exe` |

Test builds:

- After the date, the app shows *"This test build has ended"* and quits. Reinstalling doesn't help (the date is inside the installer), and setting the PC clock back is detected.
- **End it early for everyone:** set `"enabled": false` in [`beta.json`](beta.json) and push it. Testers need to be online for this; the date always applies.
- Settings → About shows days left and a **Send feedback** button (opens a GitHub issue; change with `-FeedbackUrl`).

The installer isn't code-signed, so Windows SmartScreen will warn. Testers click **More info → Run anyway**. Share the `.exe` via Google Drive, WeTransfer, a GitHub Release, etc. The full guide, including how to extend or shorten a period after sending, is in [docs/BUILDING-AND-SHARING.md](docs/BUILDING-AND-SHARING.md).

## Project layout

```
src/                  React frontend
  island/             The island shell: collapse/expand, hover, minimize, drag & drop
  modules/            One folder per island tab: home, media, todos, stash, timer,
                      stats, alerts, wellness, pet, settings
  pet/                Procedural SVG pet and its on-island component
  buddy/              The desktop pet window (a separate window from the island)
  state/              Zustand stores, one per feature, persisted via persist()
  lib/                Framework-free helpers: Rust bridge, persistence, quick-add parser
  ui/                 Shared UI primitives, icons, folder switcher, logo

src-tauri/src/        Rust backend (one module per concern; see docs/ARCHITECTURE.md)
  lib.rs              App setup, plugins, shortcuts and every command
  window.rs           Window placement, visibility, capture privacy
  hit.rs              Click-through hit testing and hover events
  drop.rs             Native drag-and-drop target (files, links, text)
  media.rs            Now-playing via the Windows media session
  audio.rs            System volume
  stats.rs            CPU, memory, battery, network, disk
  buddy.rs            The desktop pet's window and drag handling
  agents.rs           Agent endpoint (127.0.0.1:47823) and Claude Code hooks
  beta.rs             Test-build expiry and kill switch

scripts/build-beta.ps1   Builds the installer you send to friends
docs/                    Architecture and build/sharing documentation
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+Space` | Open / close the island |
| `Ctrl+Alt+V` | Jump to clipboard history |
| `Ctrl+Alt+T` | Quick-add a task |
| `Ctrl+Alt+P` | Play / pause media |
| `Ctrl+Alt+B` | Let the pet roam / call it home |
| `Ctrl+Alt+M` | Minimize / restore the island |
| `Alt+1…9`, `Alt+0` | Switch folder / show all |
| `Ctrl+N` | New doc (in Stash) |
| `Ctrl+F` | Search the stash |
| `Ctrl+,` | Settings |
| `Esc` | Close |

Dragging the pet out of the island with the mouse also lets it roam.

## Privacy

Everything is stored locally in your app-data folder. The only outbound network requests are link previews you explicitly trigger, and they can be turned off entirely in Settings → Privacy. No accounts, no analytics, no telemetry. The only other request is the optional test-build kill switch, which only exists in test builds.

## License

Not yet licensed — all rights reserved by the author for now.
