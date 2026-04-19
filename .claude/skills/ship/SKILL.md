---
name: ship
description: Full release workflow for the BlueAir Homey app. Use this skill whenever the user says "ship", "publish", "release", "deploy", "bump and publish", or asks to get code live on the App Store. Also use it when they ask to commit + merge + push + publish as a single flow.
---

# Ship — BlueAir release workflow

Executes the full build → version bump → commit → push → publish sequence. Stop and ask the user before any destructive or irreversible step if context is ambiguous.

## Step 1 — Check working tree

Run `git status`. If there are uncommitted changes to source files (`.ts`, `.json`, `.html`, `.svg`) other than the standard preview/widget image files, ask the user whether to include them or stash first.

Run `npm run build`. If the build fails, stop here and report the TypeScript errors. Do not proceed.

## Step 2 — Determine version bump

Ask the user (or infer from context) what kind of bump this is:
- **patch** — bug fixes only (most common)
- **minor** — new feature or capability added
- **major** — breaking change or complete rework

Read `.homeycompose/app.json`, find the `"version"` field, and compute the new version string using semver. Show the user the before/after and confirm before writing.

Write the new version back into `.homeycompose/app.json`.

## Step 3 — Commit

Stage all changed source files. Do NOT stage:
- `node_modules/`
- `.homeybuild/`
- `*.png` files in `widgets/` named `*2.png` (those are duplicates)

Craft a commit message:
```
Bump version to v<new-version>
```

Include any unreleased changes in the commit body if they are significant (pull from recent unstaged file names or ask the user for a one-liner summary).

Push to `origin main`.

## Step 4 — Publish

Tell the user: "Ready to publish v<version> to the Homey App Store. Run this in your terminal:"

```
! homey app publish
```

Explain that `homey app publish` builds the app, validates the manifest, and submits to the store. The user must run it themselves because it requires interactive auth.

## Notes

- The app version is in `.homeycompose/app.json`, NOT `package.json`.
- Build output goes to `.homeybuild/` — never commit this directory.
- If the user is on a feature branch, merge to `main` first (or ask).
- `homey app publish` must be run by the user in their terminal (`! homey app publish`).
