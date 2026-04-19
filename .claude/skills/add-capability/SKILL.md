---
name: add-capability
description: Scaffold a complete new device capability for the BlueAir Homey app. Use this skill whenever the user wants to add a new capability, sensor reading, toggle, or control to any BlueAir device. Covers the full pipeline: JSON definition → driver manifest → device code → optional flow cards.
---

# Add Capability

Walks through every file that must change to add a new capability end-to-end. The skill handles both read-only sensor capabilities and read-write control capabilities.

## Step 1 — Gather requirements

Ask the user (or infer from context):

1. **Capability ID** — snake_case, e.g. `measure_co2`, `germ_shield`. Must be globally unique in the app.
2. **Type** — `boolean`, `number`, or `string` (enum).
3. **Direction** — read-only (sensor) or read-write (control)?
4. **Which drivers** — one or more of: `classic`, `pure`, `humidifier`, `healthprotect`, `dustmagnet`.
5. **API attribute name** — the key returned by `blueairaws-client` (check `BlueAirDeviceState` in `node_modules/blueairaws-client/dist/Consts.d.ts`), e.g. `germshield`, `co2`, `gsnm`.
6. **UI component** — `toggle` (boolean controls), `sensor` (read-only numbers/strings), `picker` (enums), `slider` (number range).
7. **Icon** — path under `/assets/images/`, e.g. `/assets/images/measure_co2.svg`.
8. **Flow action card needed?** — if read-write, usually yes.
9. **Flow trigger card needed?** — if read-only sensor, usually yes (fires when value changes).

## Step 2 — Create capability JSON

Create `.homeycompose/capabilities/<capability-id>.json`:

```json
{
  "type": "<boolean|number|string>",
  "title": {
    "en": "...",
    "sv": "...",
    "nl": "...",
    "da": "...",
    "de": "...",
    "es": "...",
    "fr": "...",
    "it": "...",
    "no": "...",
    "pl": "...",
    "ru": "...",
    "ko": "...",
    "ar": "..."
  },
  "getable": true,
  "setable": <true|false>,
  "uiComponent": "<toggle|sensor|slider|picker>",
  "icon": "/assets/images/<icon>.svg"
}
```

For **number** capabilities also add: `"units"`, `"decimals"`, `"min"`, `"max"` (if bounded), `"insights": true`, `"chartType": "spline"`.
For **boolean** capabilities that should not show as a quick-action tile, add `"uiQuickAction": false`.

Use an existing capability file in `.homeycompose/capabilities/` as a reference template.

## Step 3 — Add to driver manifest

For each target driver, open `drivers/<driver>/driver.compose.json` and add `"<capability-id>"` to the `"capabilities"` array. Match the order of existing capabilities (sensors before controls).

For **optional capabilities** on HealthProtect (those added dynamically based on API response), they still need to be listed in the manifest but are only added in code at runtime via `addCapability()`.

## Step 4 — Wire into device class

### 4a — deviceCapabilities array

Add `"<capability-id>"` to the `protected readonly deviceCapabilities` array in the device class. Skip this for optional capabilities on HealthProtect/DustMagnet (they use `discoverOptionalCapabilities` instead).

### 4b — applyStatus()

**For AWS devices (pure/humidifier/healthprotect/dustmagnet)**:
```typescript
const myAttr = filterSettings(attrs, '<api-attribute-name>');
// ...
this.setCapabilityValue('<capability-id>', <mapped-value>).catch(this.error);
```

Mapping patterns:
- boolean: `myAttr?.value === 'true'`
- number: `Number(myAttr?.value ?? 0)`
- string: `String(myAttr?.value ?? '')`

For **optional capabilities** (HealthProtect), wrap with `if (this.hasCapability('<capability-id>'))`.

**For Classic device**, locate where `resultXxx` variables are set via `this.filterSettings()` and add the new one there, then call `setCapabilityValue` in both the initial load block AND the `setInterval` update block.

### 4c — setupListeners() (read-write capabilities only)

Add a capability listener:
```typescript
this.registerCapabilityListener('<capability-id>', async (value) => {
  await this.safeSetCommand('<capability-id>', () =>
    client.setXxx(data.uuid, value)
  );
});
```

Add a `performSet<Name>` method in `BlueAirAwsBaseDevice.ts`:
```typescript
public async performSet<Name>(value: <type>): Promise<void> {
  if (!this.client) throw new Error('Client not initialized');
  this.logger.info(`action:set-<name> → "${this.getName()}" value=${value}`);
  try {
    await this.client.setDeviceStatus(this.getData().uuid, '<api-key>', value);
    await this.setCapabilityValue('<capability-id>', value);
    this.logger.debug('action:set-<name> ok');
  } catch (err) {
    this.logger.error('action:set-<name> failed:', err);
    throw err;
  }
}
```

## Step 5 — Flow action card (read-write)

Create `.homeycompose/flow/actions/set-<name>.json`:

```json
{
  "id": "set-<name>",
  "title": { "en": "Set <name>", ... },
  "hint": { "en": "Turn the <name> on or off", ... },
  "args": [
    {
      "name": "device",
      "type": "device",
      "filter": "driver_id=<driver>"
    },
    {
      "name": "<arg>",
      "type": "dropdown",
      "values": [
        { "id": "true", "label": { "en": "On" } },
        { "id": "false", "label": { "en": "Off" } }
      ]
    }
  ]
}
```

Register in `setupListeners()`:
```typescript
this.homey.flow.getActionCard('set-<name>').registerRunListener(async (args) => {
  await (args.device as <DeviceClass>).performSet<Name>(args.<arg> === 'true');
});
```

## Step 6 — Flow trigger card (sensors that change over time)

Create `.homeycompose/flow/triggers/<capability>-has-changed.json`:

```json
{
  "id": "<capability>-has-changed",
  "title": { "en": "<Capability> has changed", ... },
  "tokens": [
    { "name": "device-name", "type": "string", "title": { "en": "Device name" } },
    { "name": "device-uuid", "type": "string", "title": { "en": "Device UUID" } },
    { "name": "<value>", "type": "number", "title": { "en": "<Value>" } }
  ]
}
```

Add `private saved<Name>: DeviceSetting | null = null` to the device class.

In `applyStatus()` inside `if (this.isInitialized)`:
```typescript
if (this.saved<Name>?.value !== myAttr?.value) {
  this.homey.flow.getTriggerCard('<capability>-has-changed')
    .trigger({ 'device-name': name, 'device-uuid': uuid, '<value>': Number(myAttr?.value ?? 0) })
    .catch((e) => this.error('Failed to trigger <capability>-has-changed', e));
}
```

Update saved value at the end of `applyStatus()`:
```typescript
this.saved<Name> = myAttr;
```

## Step 7 — Build and verify

Run `npm run build`. Fix any TypeScript errors. Confirm the new capability appears in `.homeybuild/` output.

## Checklist

- [ ] `.homeycompose/capabilities/<id>.json` created with all 13 locales
- [ ] Added to `driver.compose.json` for each target driver
- [ ] Added to `deviceCapabilities[]` (or `discoverOptionalCapabilities` for optional)
- [ ] `setCapabilityValue` call in `applyStatus()`
- [ ] `registerCapabilityListener` in `setupListeners()` (if setable)
- [ ] `performSet*` method in `BlueAirAwsBaseDevice` (if setable)
- [ ] Action card JSON + `registerRunListener` (if setable)
- [ ] Trigger card JSON + saved-value comparison (if sensor that changes)
- [ ] `npm run build` passes
