# pi-workbench

![pi-workbench screenshot](assets/screenshot.png)

Terminal workbench for switching between live [Pi](https://pi.dev) sessions.

`pi-workbench` is a small Pi package plus CLI. It uses tmux internally, but the intended workflow is simple:

```bash
pi-workbench
```

You get a two-pane terminal layout:

- left: compact running Pi session list, 36 columns by default
- right: the active Pi session

Inactive Pi sessions stay alive in hidden tmux windows and are swapped into the right pane when selected. If a managed Pi session exits, it remains in the list as stopped and can be reopened by selecting it.

## Status

Early development prototype. The v1 target is Ghostty + tmux.

## Install

```bash
pi install npm:pi-workbench
pi-workbench
```

Global Pi npm installs use `npm install -g`, so the package's `pi-workbench` binary should be available on `PATH`.

Project-local installs may not expose the CLI globally. If `pi-workbench` is not on `PATH`, the extension shows a warning with suggested fixes.

## Local development

```bash
git clone https://github.com/dmallory42/pi-workbench.git
cd pi-workbench
npm install
npm run check
npm link
pi install /path/to/pi-workbench
pi-workbench
```

`npm run check` runs TypeScript, unit tests, and an automated tmux smoke test.

## Usage

```bash
pi-workbench
```

If no Pi sessions are running for the current directory, it starts one. If a live Pi session for the current directory already exists, `pi-workbench` reuses it instead of spawning a duplicate.

Sidebar controls:

| Key | Action |
| --- | --- |
| `ctrl+g` | Focus the sidebar from the workbench |
| `↑` / `↓` | Move selection |
| `Enter` | Switch selected session into the right pane; reopen it if stopped |
| `n` | Start a new Pi session from recent projects or a typed path |
| `r` | Rename selected session in the workbench |
| `k` | Kill selected live session |
| `x` | Remove selected stopped session |
| `q` | Quit workbench |

Quitting asks for confirmation and then kills managed Pi processes. Pi session histories can be resumed later using Pi's normal resume flow.

Killing a selected live session asks for confirmation. If you kill the active session and no other live session exists, `pi-workbench` restarts that same workbench row in place so the right pane remains usable without creating duplicate rows.

### Starting sessions in another directory

Press `n` to open the new-session picker. You can choose a recent project with `↑`/`↓` and `Enter`, or type any directory path directly. While typing a path, `pi-workbench` shows a muted inline completion suggestion; press `Tab` to accept it. `~` paths and relative paths are supported.

## Ghostty/tmux setup

Pi works inside tmux, but tmux needs extended key forwarding for modified keys. Recommended `~/.tmux.conf`:

```tmux
set -g extended-keys on
set -g extended-keys-format csi-u
```

Then restart tmux fully:

```bash
tmux kill-server
tmux
```

`pi-workbench` enables tmux mouse mode for its managed session so you can click the sidebar/right pane to change focus where supported. If mouse-wheel scrolling enters tmux copy-mode and typing starts searching instead of returning to Pi's prompt, disable tmux mouse mode for the workbench:

```json
{
  "mouse": false
}
```

You can also apply it to a running workbench immediately with:

```bash
tmux set-option -t pi-workbench mouse off
```

With mouse mode off, use `ctrl+g` to focus the sidebar from the right pane. `pi-workbench` also tries to enable tmux extended-key handling for the current tmux server, but adding the config above keeps the setting persistent.

## Development commands

```bash
pi-workbench doctor          # print environment diagnostics
pi-workbench doctor --json   # machine-readable diagnostics
pi-workbench reset           # kill the workbench tmux session
pi-workbench reset --clear-registry
pi-workbench prune           # remove stale live entries
pi-workbench prune --stopped # remove stopped entries too
pi-workbench smoke           # run automated tmux smoke test
```

Equivalent npm scripts are available during development:

```bash
npm run doctor
npm run reset
npm run prune
npm run smoke
```

## Testing

Run the automated checks:

```bash
npm run check
```

The smoke test creates temporary isolated tmux sessions, verifies the two-pane layout, checks the compact sidebar width, exercises the real sidebar render path, verifies focus hints and selected-row highlighting, checks confirmation flows, verifies active-session restart behavior, verifies a `swap-pane` session switch, and then tears the tmux sessions down.

You can run only the smoke test with:

```bash
npm run smoke
```

## Layout configuration

The sidebar defaults to 36 columns. Override it temporarily with:

```bash
PI_WORKBENCH_SIDEBAR_WIDTH=36 pi-workbench
```

Or persist preferences in `~/.pi/workbench/config.json`:

```json
{
  "sidebarWidth": 40,
  "hideTmuxStatus": true,
  "mouse": true
}
```

## How it works

- The sidebar groups running and stopped sessions, disambiguates duplicate names, supports local renames, and shows the selected session path and git branch in the footer.
- The Pi extension registers each Pi process in `~/.pi/workbench/sessions.json`.
- The extension updates coarse status: `idle`, `thinking`, `running`, `stopped`.
- The CLI creates a tmux session named `pi-workbench`.
- The visible `workbench` window contains a compact sidebar and active Pi pane.
- Other managed Pi sessions live in hidden tmux windows.
- Opening the workbench reuses a live Pi pane for the current directory when one already exists.
- Switching uses `tmux swap-pane` to preserve each Pi process and PTY state.

## Out of scope for v1

- Historical session browsing
- Cross-session messaging/handoff
- Browser dashboard
- Non-tmux backends
- Multiple active Pi panes at once
