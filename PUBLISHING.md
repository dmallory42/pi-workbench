# Publishing pi-workbench

Release checklist for npm and the Pi package gallery.

1. Confirm the package metadata in `package.json` is current.
2. Run the full verification suite:

   ```bash
   npm run check
   ```

3. Inspect the package contents:

   ```bash
   npm pack --dry-run
   ```

4. Commit and push all release changes, including `dist/` and `assets/screenshot.png`.
5. Publish to npm:

   ```bash
   npm publish --access public
   ```

6. Verify installation through Pi:

   ```bash
   pi install npm:pi-workbench
   pi-workbench doctor
   pi-workbench
   ```

The Pi package gallery discovers npm packages that include the `pi-package` keyword. The gallery preview image is configured in `package.json` under `pi.image`.
