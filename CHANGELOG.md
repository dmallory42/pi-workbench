# Changelog

## 0.2.0 - 2026-05-06

### Added

- Added faster sidebar status refreshes by watching the workbench session registry for changes instead of waiting for the slower unfocused refresh interval.
- Added product-level smoke coverage for the full status lifecycle: extension status writes, runtime reloads, registry updates, and sidebar rendering.

### Changed

- Improved Pi session status handling so prompt activity is represented as `running` and completed turns return to `ready`.
- Made extension duplicate-load protection version-aware so newly installed pi-workbench versions can register after a Pi extension reload.
- Preserved session metadata such as custom names, model, creation time, and git details across status updates.

### Fixed

- Fixed reloaded Pi extension runtimes being blocked by stale duplicate-load state, which caused live panes to appear stuck as `ready`.
- Fixed session reloads being marked as stopped when the Pi runtime was reloaded rather than quit.
