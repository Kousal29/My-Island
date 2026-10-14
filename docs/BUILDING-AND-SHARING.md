# Building and sharing My Island

How to build installers, the difference between test and permanent builds, how to change or end a test period after it has been sent, and what your testers need to do.

- [1. Two kinds of build](#1-two-kinds-of-build)
- [2. Bundles: what gets produced](#2-bundles-what-gets-produced)
- [3. Build commands](#3-build-commands)
- [4. Sending a build](#4-sending-a-build)
- [5. Changing the test period](#5-changing-the-test-period)
- [6. Ending a test early (kill switch)](#6-ending-a-test-early-kill-switch)
- [7. Making a test build permanent](#7-making-a-test-build-permanent)
- [8. What testers need to know](#8-what-testers-need-to-know)
- [9. Resetting a tester's data](#9-resetting-a-testers-data)
- [10. Troubleshooting](#10-troubleshooting)
- [11. Pre-send checklist](#11-pre-send-checklist)

---

## 1. Two kinds of build

| | Test build (temporary) | Permanent build |
|---|---|---|
| Command | `.\scripts\build-beta.ps1` (21 days by default) or `-Expires YYYY-MM-DD` | `.\scripts\build-beta.ps1 -NoExpiry` |
| Output file | `My-Island-Test-until-YYYY-MM-DD.exe` | `My-Island-Setup.exe` |
| Stops working | After the end of the expiry day | Never |
| Survives reinstall | The expiry date is inside the installer, so no | Yes, it's just an app |
| Remote off-switch | Yes (unless `-NoKillSwitch`) | No (no URL is compiled in) |
| Feedback button | Yes | Yes |

The date is compiled into the file. **Nothing you do on a tester's PC changes it**, and nothing they do to the install (reinstalling, deleting the app-data folder, changing the clock) makes it last longer. The only way to change a sent build's end date is to send them a new build.

## 2. Bundles: what gets produced

Tauri can produce two Windows installer formats. The project config (`src-tauri/tauri.conf.json`) asks for both by default.

| Bundle | File | Use it for |
|---|---|---|
| **NSIS** | `My Island_0.1.0_x64-setup.exe` (under `bundle\nsis\`) | **This is the one to share.** A single `.exe`, per-user install (`installMode: currentUser`, no admin rights). Lets testers uninstall from Windows Settings. |
| **MSI** | `My Island_0.1.0_x64_en-US.msi` (under `bundle\msi\`) | Enterprise deployment via Group Policy or Intune. Not needed for friends. |

The beta script builds **only NSIS** (`npx tauri build --bundles nsis`) and copies that one file to the project folder under a name that says what it is. A plain `npm run tauri build` builds both, which is slower and gives you a second file nobody needs.

Output locations:

- Raw bundles: `src-tauri\target\release\bundle\nsis\` and `…\bundle\msi\`
- Copied beta outputs: the project root, as `My-Island-Test-until-….exe` or `My-Island-Setup.exe`. These are git-ignored (`/My-Island-*.exe` in `.gitignore`), so they will not be pushed to GitHub by accident.

## 3. Build commands

Run from the project root in PowerShell:

```powershell
# Test build, expires 21 days from today
.\scripts\build-beta.ps1

# Test build with an explicit end date
.\scripts\build-beta.ps1 -Expires 2026-12-01

# Test build with no remote off-switch (only the date applies)
.\scripts\build-beta.ps1 -NoKillSwitch

# Permanent build
.\scripts\build-beta.ps1 -NoExpiry

# Override where "Send feedback" points
.\scripts\build-beta.ps1 -FeedbackUrl "https://example.com/feedback"
```

Important details:

- `-Expires` must be `YYYY-MM-DD`. Anything else stops the script with an error.
- The script runs `cargo clean -p my-island --release` first. The date and URLs are compiled in, so the app crate must be rebuilt every time. This is why a beta build takes several minutes even when nothing else changed. Don't remove that line.
- The script checks the exit code of each step and stops on the first failure, printing `Build failed (exit N)`.
- The default `-Expires` is computed when the script runs. Running it on 15 October 2026 gives 5 November 2026.

Plain development and release builds are unaffected by all of this. They have no environment variables set, so they never expire and have no off-switch.

## 4. Sending a build

1. Build (section 3). Check the console ends with `Share this file: …`.
2. Test it yourself first. Install the file on a clean profile if you can, and check Settings → About shows the expected "days left".
3. Upload the single `.exe` to Google Drive, WeTransfer, OneDrive, or a **GitHub Release** (see below).
4. Tell testers the steps in section 8, especially the SmartScreen warning.

**Format:** one file, `My-Island-Test-until-YYYY-MM-DD.exe` or `My-Island-Setup.exe`. Send that file and nothing else. Don't zip it (a zip just adds a step), and don't send the `target\` folder.

**GitHub Release option:** good for tracking who has which version, and the download link stays the same when you upload a new version.

1. On GitHub: Releases → Draft a new release → tag `v0.1.0-test-2026-11-05` (or similar).
2. Attach the `.exe`, write a short note with the expiry date and the feedback link.
3. Publish. Share the release page link.

Note: a GitHub Release is only visible to people who can see the repository, unless the repository is public. For friends outside the repo, use Drive or WeTransfer.

Because the installer isn't code-signed, Windows Defender SmartScreen will warn about it. This is expected. Code signing would remove the warning but costs money and time; not needed for a small group.

## 5. Changing the test period

### Shorten a build you have already sent

You **cannot** change the end date of a file that's already out there. Two options:

- **Use the kill switch** (section 6): it ends the test right away for everyone who is online, without a new build.
- **Send a new build** with the new date. Testers must install it. The old one keeps running until its own date.

### Shorten or extend for future builds

Just use a different `-Expires`:

```powershell
.\scripts\build-beta.ps1 -Expires 2026-11-20   # shorter than the default
.\scripts\build-beta.ps1 -Expires 2027-01-31   # longer
```

### Extend a build that's already been sent

Build a new one with a later `-Expires` and send it. Testers install it **over** the existing app. Their data is kept, because the app-data folder is not part of the installer.

Details that matter here:

- An already-expired build can be replaced with a new, later one. The clock guard takes the newer time, so the new build works.
- If a tester keeps running the old build, it still expires on the old date. Install is the only way to get the extension.

## 6. Ending a test early (kill switch)

The kill switch is a JSON file in the repository, read by every test build over the internet:

[`beta.json`](../beta.json)

```json
{
  "enabled": true,
  "message": "This test of My Island has ended. Thanks so much for trying it and for your feedback!"
}
```

To end all running test builds:

1. Edit `beta.json` and set `"enabled": false`. Optionally change `message`.
2. Commit and push to `main`.

Within about six hours (or the next time the app starts) every running test build shows the message and quits. Only builds that can reach GitHub are affected; offline testers keep going until the date.

To *undo* it, set `"enabled": true` and push. Testers will be fine again on their next start; the app does not remember that it was ended.

**The kill switch requires the file to be reachable without a login.** The URL the build uses is:

`https://raw.githubusercontent.com/Kousal29/My-Island/main/beta.json`

- If the repository is **public**, this works.
- If the repository is **private**, the URL returns a 404 to anyone without access, and the kill switch silently does nothing. Check this before you rely on it: open the URL in a private browser window. If it doesn't show the JSON, either make the repo public or put `beta.json` somewhere else public and rebuild with `-KillSwitchUrl`.

The kill switch needs a rebuild only if the URL changes, not to change the message or flip `enabled`.

## 7. Making a test build permanent

Build with `-NoExpiry` and send `My-Island-Setup.exe`. It has no date and no kill switch.

Testers who already have a test build can install the permanent one over it and keep their data. If their test build had already expired on their PC, the permanent build still runs because it has no date.

## 8. What testers need to know

Put this in the message you send them, or adapt it:

> **Installing My Island (test build)**
>
> 1. Download `My-Island-…exe` and double-click it.
> 2. Windows says "Windows protected your PC" because the app isn't signed yet. Click **More info**, then **Run anyway**.
> 3. The installer is per-user, so no administrator rights are needed.
> 4. My Island appears at the top of your screen. Hover it to open, or press **Ctrl+Alt+Space**.
> 5. Settings → About shows how many days the test has left, and has a **Send feedback** button.
>
> This is a test version. It stops working on **[date]**. Your data stays on your PC and the test doesn't send anything anywhere (except link previews, which you can turn off in Settings → Privacy).
>
> To remove it: Windows Settings → Apps → My Island → Uninstall.

Things worth telling them, because they look like bugs otherwise:

- The island is always there but mostly transparent. Clicks pass through the empty part of the top strip.
- If the island hides, hover over the thin bar at the top to bring it back, or press Ctrl+Alt+M.
- The desktop pet is optional. Press Ctrl+Alt+B or drag the pet out of the island.
- Claude Code integration is optional and only connects when you press "Connect Claude Code".

## 9. Resetting a tester's data

Data is kept in the app-data folder. To wipe one tester's data (for example, to give them a clean first run):

1. Quit My Island from the tray icon.
2. Delete `%APPDATA%\dev.myisland.app\` (paste that into Explorer's address bar).
3. Start the app again.

Don't delete the registry value `HKCU\Software\MyIsland\Beta\LastSeen` on a tester's PC. That value is the clock guard. Deleting it lets a clock rollback revive an expired build.

Your own test machine can be reset the same way, but for a truly clean test use a Windows user account you haven't used before.

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `error: unexpected argument 'nsis' found` | The build was started with `npm run tauri build -- --bundles nsis`. PowerShell drops the `--` and npm swallows the option. The script now runs `npx tauri build --bundles nsis` directly. Use the script, not `npm run`. |
| `Build failed (exit 1)` with a Rust error | Read the lines above it in the log. Run `cargo check --manifest-path src-tauri/Cargo.toml` to see the full error without the full build. |
| Build works but the installer is missing | The script copies the newest `.exe` from `src-tauri\target\release\bundle\nsis\`. If nothing was produced, check the log for an earlier error. |
| The beta build didn't end when I set `enabled: false` | Check the URL in section 6 opens in a private window. Check the tester is online. Check the change was pushed to `main`, not a branch. |
| "Your system clock seems to have moved backwards" | The clock guard fired. Correct the PC's date and time, then start the app again. |
| First `tauri dev` takes many minutes | Normal. The Rust dependencies compile once. Later runs are much quicker. |

## 11. Pre-send checklist

- [ ] `npm run typecheck` passes.
- [ ] The build script finished with `Share this file: …`.
- [ ] Installed the `.exe` on a clean profile; the island appears, and Settings → About shows the right days left.
- [ ] Quit and reopened the app; the stash, to-dos and Home layout were kept.
- [ ] The file name shows the right end date (or `My-Island-Setup.exe` for permanent builds).
- [ ] If it's a test build: `https://raw.githubusercontent.com/Kousal29/My-Island/main/beta.json` opens in a private window and shows `"enabled": true`.
- [ ] `beta.json` is committed and pushed, if you changed it.
- [ ] The file is **not** committed to git (it's ignored; check with `git status`).
