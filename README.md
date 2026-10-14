# My Island

A Dynamic Island for Windows — a small pill that lives at the top of your screen, expands into now-playing controls, a to-do list, a file/link/clipboard stash, a focus timer and live system stats, and comes with a cat (or dog) you can pet, feed, and let loose on your desktop.

Built fresh with **Tauri 2 + Rust** and **React + TypeScript**, inspired by [notchidex.dev](https://notchidex.dev), [dynamic-island-for-windows](https://github.com/rajsriv/dynamic-island-for-windows) and [L4-Windows-NotchBar](https://github.com/Linux5Real/L4-Windows-NotchBar) — no code shared with any of them.

![platform](https://img.shields.io/badge/platform-Windows-0078D6) ![stack](https://img.shields.io/badge/stack-Tauri%202%20%2B%20React-24C8DB)

## Features

- **Island shell** — a pill or notch at the top-center of your screen that peeks on hover and expands on click, with spring animations, drag-and-drop, and per-monitor placement.
- **Now Playing** — reads any app that reports to the Windows media session (Spotify, browsers, VLC, Apple Music…): artwork, transport controls, seek bar, and scroll-to-change volume.
- **To-do** — multiple lists, priorities, due dates, subtasks, and a natural-language quick-add ("Pay rent tomorrow 9am !high #bills").
- **Stash** — a shelf for files (only the path is stored, never a copy), links (with fetched previews), clipboard history (auto-captured, secrets excluded), and rich docs with Markdown, checklists and templates.
- **Workspaces** — group everything above into separate projects/contexts (e.g. "Personal", "Work", "Thesis"), with one switcher and Alt+1…9 shortcuts.
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
| State | Zustand, persisted via `tauri-plugin-store` |
| Windows integration | `windows-rs` (media session, volume, battery, fullscreen detection, native OLE drag & drop) |

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

The first build compiles ~425 Rust crates and takes several minutes; subsequent runs with only frontend changes reload instantly, and Rust-only changes rebuild in well under a minute thanks to the dev profile and linker settings in `src-tauri/`.

### Build a release binary

```sh
npm run tauri build
```

Produces an installer (NSIS + MSI) under `src-tauri/target/release/bundle/`.

## Project layout

```
src/                  React frontend
  island/             The island shell: collapse/expand, hit-testing, drag & drop
  modules/            Each island tab (home, media, todos, stash, timer, stats, pet, settings)
  pet/                Procedural SVG pet + its on-island component
  buddy/              The desktop pet window (separate from the main island window)
  state/              Zustand stores (one per feature) + persistence
  lib/                Framework-agnostic helpers (bridge to Rust, markdown, quick-add parser, …)
  ui/                 Shared UI primitives (buttons, popovers, workspace switcher, …)

src-tauri/            Rust backend
  src/window.rs        Window placement, sizing, compact/expanded modes
  src/hit.rs           Click-through hit testing (per-window interactive rects)
  src/drop.rs          Native OLE drag-and-drop target (files, links, text)
  src/media.rs         Windows media session integration
  src/audio.rs         System volume control
  src/stats.rs         CPU/RAM/battery/network/disk polling
  src/buddy.rs         The desktop pet's window + native drag physics
  src/clipboard.rs     Clipboard watcher (skips password-manager-flagged secrets)
  src/links.rs         Link preview fetching (title/description/image/favicon)
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+Space` | Open / close the island |
| `Ctrl+Alt+V` | Jump to clipboard history |
| `Ctrl+Alt+T` | Quick-add a task |
| `Ctrl+Alt+P` | Play / pause media |
| `Ctrl+Alt+B` | Let the pet roam / call it home |
| `Alt+1…9`, `Alt+0` | Switch workspace / show all |
| `Ctrl+N` | New doc (in Stash) |
| `Ctrl+F` | Search the stash |
| `Ctrl+,` | Settings |
| `Esc` | Close |

Dragging the pet out of the island with the mouse also lets it roam.

## Privacy

Everything is stored locally in your app-data folder. The only outbound network requests are link previews you explicitly trigger, and they can be turned off entirely in Settings → Privacy. No accounts, no analytics, no telemetry.

## License

Not yet licensed — all rights reserved by the author for now.
