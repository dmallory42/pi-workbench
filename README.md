# pi-workbench

Terminal workbench for switching between live [Pi](https://pi.dev) sessions.

`pi-workbench` is a small Pi package plus CLI. It uses tmux internally, but the intended workflow is simple:

```bash
pi-workbench
```

You get a two-pane terminal layout:

- left: compact running Pi session list, 32 columns by default
- right: the active Pi session

Inactive Pi sessions stay alive in hidden tmux windows and are swapped into the right pane when selected. If a managed Pi session exits, it remains in the list as stopped and can be reopened by selecting it.

## Status

Early development prototype. The v1 target is Ghostty + tmux.

## Install

After publishing, the intended install is:

```bash
pi install npm:pi-workbench
pi-workbench
```

Global Pi npm installs use `npm install -g`, so the package's `pi-workbench` binary should be available on `PATH`.

Project-local installs may not expose the CLI globally. If `pi-workbench` is not on `PATH`, the extension shows a warning with suggested fixes.

## Local development

```bash
git clone <repo>
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

If no managed Pi sessions are running, it starts one in the current directory.

Sidebar controls:

| Key | Action |
| --- | --- |
| `F1` | Focus the sidebar from the workbench |
| `↑` / `↓` | Move selection |
| `Enter` | Switch selected session into the right pane; reopen it if stopped |
| `n` | Start a new Pi session |
| `k` | Kill selected live session |
| `x` | Remove selected stopped session |
| `q` | Quit workbench |

Quitting asks for confirmation and then kills managed Pi processes. Pi session histories can be resumed later using Pi's normal resume flow.

Killing a selected live session asks for confirmation. If you kill the active session and no other live session exists, `pi-workbench` immediately starts a replacement Pi session so the right pane remains usable.

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

`pi-workbench` enables tmux mouse mode for its managed session so you can click the sidebar/right pane to change focus where supported. It also tries to enable tmux extended-key handling for the current tmux server, but adding the config above keeps the setting persistent.

## Testing

Run the automated checks:

```bash
npm run check
```

The smoke test creates a temporary isolated tmux session, verifies the two-pane layout, checks the compact sidebar width, verifies the fake Pi command runs in the right pane, verifies the fake sidebar command runs in the left pane, checks the `F1` binding, and then tears the tmux session down.

You can run only the smoke test with:

```bash
npm run smoke
```

## Layout configuration

The sidebar defaults to 32 columns. Override it with:

```bash
PI_WORKBENCH_SIDEBAR_WIDTH=36 pi-workbench
```

## How it works

- The sidebar groups running and stopped sessions, disambiguates duplicate names, and shows the selected session path and git branch in the footer.
- The Pi extension registers each Pi process in `~/.pi/workbench/sessions.json`.
- The extension updates coarse status: `idle`, `thinking`, `running`, `stopped`.
- The CLI creates a tmux session named `pi-workbench`.
- The visible `workbench` window contains a compact sidebar and active Pi pane.
- Other managed Pi sessions live in hidden tmux windows.
- Switching uses `tmux swap-pane` to preserve each Pi process and PTY state.

## Out of scope for v1

- Historical session browsing
- Cross-session messaging/handoff
- Browser dashboard
- Non-tmux backends
- Multiple active Pi panes at once
