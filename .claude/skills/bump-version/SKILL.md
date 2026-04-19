---
name: bump-version
description: Bump the BlueAir Homey app version number. Use this skill when the user says "bump version", "increment version", "new version", or prepares for a release. Handles patch, minor, and major bumps and writes the result to .homeycompose/app.json.
---

# Bump Version

The app version lives in `.homeycompose/app.json` at the top-level `"version"` field.
`package.json` has its own version but that is NOT the published app version — only `.homeycompose/app.json` matters.

## Steps

1. Read `.homeycompose/app.json` and extract the current `"version"` string (semver, e.g. `"3.2.20"`).

2. Determine bump type from context:
   - **patch** — bug fixes, logging, UI tweaks (most common; increment Z in X.Y.Z)
   - **minor** — new capability, new driver, new flow card (increment Y, reset Z to 0)
   - **major** — breaking changes, complete API rework (increment X, reset Y.Z to 0)

   If unclear, ask: "Patch, minor, or major bump?"

3. Compute the new version string. Show the user:
   ```
   3.2.20  →  3.2.21  (patch)
   ```

4. Write the new version to `.homeycompose/app.json`.

5. Report: "Version bumped to v<new> in `.homeycompose/app.json`."

Do not commit, push, or publish — those steps belong to the `/ship` skill.
