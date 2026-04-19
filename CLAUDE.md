# net.tornbloms.blueair — Claude Instructions

## Project overview

Homey SDK v3 app that integrates BlueAir air purifiers and humidifiers. Five device drivers:
- **classic** — Legacy BlueAir Classic (uses `blueair-client`, non-AWS API)
- **pure** — BlueAir Pure / Blue series (AWS, lighter sensor set)
- **humidifier** — BlueAir humidifiers h35i/h76i/t10i/t20i (AWS)
- **healthprotect** — BlueAir HealthProtect (AWS, full sensors + optional CO2/HCHO/germ shield/mood light)
- **dustmagnet** — BlueAir DustMagnet (AWS, same base as HealthProtect)

App ID: `net.tornbloms.blueair` | SDK: 3 | min Homey: 12.2.0

## Build & publish

```bash
npm run build          # tsc → .homeybuild/
homey app publish      # build + validate + upload to App Store
```

Version lives in `.homeycompose/app.json` → `version`. Bump this before publishing. The `package.json` version is NOT the app version.

## Architecture

### Two API stacks

| Stack | Client library | Used by |
|-------|---------------|---------|
| Legacy | `blueair-client` (`ApiClient`) | classic only |
| AWS/Gigya | `blueairaws-client` (`BlueAirAwsClient`) | all other drivers |

### AWS inheritance chain

```
BlueAirAwsBaseDriver  ← shared client pool, pairing logic
BlueAirAwsBaseDevice  ← polling loop, auth recovery, safeSetCommand, performSet* methods
  ├── BlueAirAwsFullDevice  ← HealthProtect + DustMagnet (15 caps + optional discovery)
  │     ├── BlueAirHealthProtectDevice
  │     └── BlueAirDustMagnetDevice
  ├── BlueAirPureDevice
  └── BlueAirHumidifierDevice
```

### Key patterns

**`safeSetCommand(cap, fn)`** — wraps all capability → API calls; saves old value, reverts on failure.

**`performSet*(value)`** — public methods called by flow action card listeners (so `args.device` always routes to the right instance). After a successful API call each method calls `setCapabilityValue` for optimistic update.

**`isInitialized` flag** — `applyStatus()` skips all flow card triggers on the first call (startup). Only fires triggers on subsequent polls.

**`discoverOptionalCapabilities(attrs)`** — hook called once after first poll, before `setupListeners`. `BlueAirAwsFullDevice` uses it to dynamically `addCapability` for CO2, HCHO, germ shield, mood light based on whether the device actually reports those attributes.

**Shared client pool** — `BlueAirAwsBaseDriver.getOrCreateClient(username, password)` keeps one `BlueAirAwsClient` per username. Concurrent calls await the same promise to avoid multiple Gigya logins.

**Re-auth** — On 3 consecutive poll failures (auth-related error strings), `clearClient(username)` is called and polling stops until the device reinitialises. A 20 h proactive re-auth timer runs in every AWS device.

**`standby` is inverted** — `standby: true` in Homey means "device is ON" (not in standby). The API receives `!value`.

### Diagnostic logger

All device classes use `DiagnosticLogger` from `lib/diagnostics.ts`. Construct with:
```typescript
this.logger = new DiagnosticLogger(
  'TagName',
  (...args: unknown[]) => this.log(...(args as any[])),    // NEVER this.logger.info here!
  (...args: unknown[]) => this.error(...(args as any[]))
);
```
Logs are buffered in a 150-entry ring (shared module-level). The settings page polls `GET /logs` every 10 s to display them. `critical()` also goes to Sentry via `homey-log`.

## File layout

```
.homeycompose/
  app.json              ← version, id, permissions
  capabilities/         ← one JSON per capability
  flow/
    actions/            ← action card definitions
    triggers/           ← trigger card definitions
    conditions/         ← condition card definitions
drivers/
  BlueAirAwsBaseDriver.ts
  BlueAirAwsBaseDevice.ts
  BlueAirAwsFullDevice.ts
  BlueAirAwsUtils.ts    ← filterSettings, calculateFilterLife*, AirQuality enum
  classic/device.ts     ← standalone, no shared AWS base
  pure/device.ts
  humidifier/device.ts
  healthprotect/device.ts
  dustmagnet/device.ts
lib/
  diagnostics.ts        ← DiagnosticLogger, log buffer, Sentry init
settings/index.html     ← settings page (log viewer, verbose toggle)
api.ts                  ← GET /logs, DELETE /logs
locales/                ← en sv nl da de es fr it no pl ru ko ar
assets/images/          ← SVG icons referenced by capabilities
```

## Adding a new capability

1. Create `.homeycompose/capabilities/<name>.json` — set `type`, `title` (all 13 locales), `getable`, `setable`, `uiComponent`, `icon`.
2. Add `"<name>"` to the relevant `driver.compose.json` capabilities array.
3. In `deviceCapabilities[]` of the device class, add `"<name>"`.
4. In `applyStatus()`, read the API attribute and call `this.setCapabilityValue('<name>', ...)`.
5. If setable: add `registerCapabilityListener` in `setupListeners()`.
6. If it needs a flow action card: create `.homeycompose/flow/actions/<id>.json`, add `performSet*` in `BlueAirAwsBaseDevice`, register `getActionCard(<id>).registerRunListener` in `setupListeners()`.

## Adding a flow trigger card

1. Create `.homeycompose/flow/triggers/<id>.json` with tokens array.
2. Add a `savedXxx: DeviceSetting | null = null` field in the device class.
3. In `applyStatus()` (inside the `if (this.isInitialized)` block): compare saved vs current, call `.trigger(tokens)` on change.
4. Update the saved value at the end of `applyStatus()`.

## Adding a flow condition card

1. Create `.homeycompose/flow/conditions/<id>.json`.
2. In `setupListeners()`: `this.homey.flow.getConditionCard('<id>').registerRunListener(async (args) => ...)`.

## Capability conventions

- **boolean toggles**: `uiComponent: "toggle"`, use `child_lock.json` as template.
- **numeric sensors**: `uiComponent: "sensor"`, `insights: true`, `chartType: "spline"`.
- **`standby`**: value `true` = device is ON. In `applyStatus`: `standby?.value === 'false'`.
- **`brightness2`**: 0–100 (AWS). `brightness`: 0–4 (Classic).
- **`filter_status`**: string set from `calculateRemainingFilterLife()`, e.g. `"83 %"`.
- **`measure_filter_life`**: number 0–100 from `calculateFilterLifePercent()`.

## Action card naming convention

Classic device cards: `set-fan-speed`, `set-brightness`, `set-childlock`
AWS device cards: `set-fan-speed2`, `set-brightness2`, `set-childlock2`, `set-automatic2`, `set-nightmode2`, `set-standby2`, `set-germshield2`, `set-moodlight2`

The `2` suffix distinguishes AWS cards from Classic cards; both can exist in the same app.

## Locale requirements

All 13 locales must be present in every capability title and flow card title/hint:
`en sv nl da de es fr it no pl ru ko ar`

## Known quirks

- `last_retrival_date` (typo) — legacy capability removed on Classic init via `removeCapability`.
- `score_tvoc` condition card — JSON file uses `score_tvoc` but code registers `score_tVOC`. Keep consistent.
- Classic driver uses `this.getStoreValue('userId')` for all API calls.
- Classic polling interval: `settings.update * 1000` ms (set by user in device settings), no enforced minimum.
- AWS minimum poll: `MIN_POLL_INTERVAL_MS = 60_000`.
- `measure_filter_life` is NOT available on Classic — the legacy API returns only a status string.

## Git workflow

Branch `main` is the release branch. Feature work on `fix/` or `feat/` branches, PR into main.
Version bump commit always precedes the publish commit.

Standard ship sequence:
1. `npm run build` — must be clean
2. Bump `version` in `.homeycompose/app.json`
3. Commit + push to main
4. `homey app publish`
