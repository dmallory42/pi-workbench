# Publishing pi-workbench

Release checklist for npm and the Pi package gallery.

## One-time setup

Create an npm automation token and add it to the GitHub repository as an Actions secret named `NPM_TOKEN`.

The publish workflow runs on GitHub Releases and can also be started manually from **Actions → Publish to npm → Run workflow**.

## Release flow

1. Confirm the package metadata in `package.json` is current.
2. Run the full verification suite locally:

   ```bash
   npm run check
   ```

3. Inspect the package contents:

   ```bash
   npm pack --dry-run
   ```

4. Commit and push all release changes, including `dist/` and `assets/screenshot.png`.
5. Create and publish a GitHub Release for the version in `package.json`.
6. The `Publish to npm` GitHub Actions workflow will:
   - install dependencies with `npm ci`
   - run `npm run build && npm test && npm pack --dry-run`
   - publish with npm provenance:

   The full tmux smoke suite is still run locally before release because GitHub's headless tmux environment can be less representative than an interactive terminal.

   ```bash
   npm publish --access public --provenance
   ```

7. Verify installation through Pi:

   ```bash
   pi install npm:pi-workbench
   pi-workbench doctor
   pi-workbench
   ```

The Pi package gallery discovers npm packages that include the `pi-package` keyword. The gallery preview image is configured in `package.json` under `pi.image`.
