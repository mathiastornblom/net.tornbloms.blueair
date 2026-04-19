---
name: add-flow-card
description: Add a new Homey flow card (action, trigger, or condition) to the BlueAir app. Use this skill when the user wants to expose a new action a user can take in a flow, a new event a flow can react to, or a new condition a flow can check. Covers JSON definition + TypeScript registration.
---

# Add Flow Card

Three card types are supported. Ask the user which one they need if not clear from context.

## Card type guide

| Type | User says... | Result |
|------|-------------|--------|
| **Action** | "I want to be able to set X from a flow" | An action card that controls the device |
| **Trigger** | "I want a flow to fire when X changes" | A trigger card that fires on device events |
| **Condition** | "I want to check if X is above/below Y in a flow" | A condition card that returns true/false |

---

## Action cards

### JSON: `.homeycompose/flow/actions/<id>.json`

```json
{
  "id": "<id>",
  "title": {
    "en": "Set <thing>",
    "sv": "...", "nl": "...", "da": "...", "de": "...", "es": "...",
    "fr": "...", "it": "...", "no": "...", "pl": "...", "ru": "...", "ko": "...", "ar": "..."
  },
  "hint": {
    "en": "Turn the <thing> on or off.",
    "sv": "...", ...
  },
  "args": [
    {
      "name": "device",
      "type": "device",
      "filter": "driver_id=<driver>"
    },
    {
      "name": "<arg-name>",
      "type": "dropdown",
      "values": [
        { "id": "true", "label": { "en": "On", "sv": "...", ... } },
        { "id": "false", "label": { "en": "Off", "sv": "...", ... } }
      ]
    }
  ]
}
```

**`filter`** restricts the card to specific drivers. Use `driver_id=healthprotect` for HealthProtect-only, or `driver_id=dustmagnet|healthprotect|pure` for multiple.

For numeric input instead of dropdown: `"type": "number"`, `"min": 0`, `"max": 100`.

### TypeScript: register in `setupListeners()`

```typescript
this.homey.flow.getActionCard('<id>').registerRunListener(async (args) => {
  await (args.device as <DeviceClass>).performSet<Name>(args.<arg-name> === 'true');
});
```

Always cast `args.device` to the concrete device class and call a `performSet*` method — never inline the API call. This ensures the correct device instance handles the call regardless of which instance last registered the listener.

If the capability doesn't exist yet, follow the **add-capability** skill first.

---

## Trigger cards

### JSON: `.homeycompose/flow/triggers/<id>.json`

```json
{
  "id": "<id>",
  "title": {
    "en": "<Thing> has changed",
    "sv": "...", ...
  },
  "tokens": [
    {
      "name": "device-name",
      "type": "string",
      "title": { "en": "Device name", "sv": "...", ... }
    },
    {
      "name": "device-uuid",
      "type": "string",
      "title": { "en": "Device UUID", "sv": "...", ... }
    },
    {
      "name": "<value-token>",
      "type": "number",
      "title": { "en": "<Value>", "sv": "...", ... }
    }
  ]
}
```

For before/after sensors add two tokens: `<thing> new` and `<thing> old`.

### TypeScript: fire in `applyStatus()`

1. Add a saved-value field at class level:
```typescript
private saved<Name>: DeviceSetting | null = null;
```

2. Inside `if (this.isInitialized)` in `applyStatus()`:
```typescript
if (this.saved<Name>?.value !== current<Name>?.value) {
  this.homey.flow.getTriggerCard('<id>')
    .trigger({
      'device-name': name,
      'device-uuid': uuid,
      '<value-token>': Number(current<Name>?.value ?? 0),
    })
    .catch((e) => this.error('Failed to trigger <id>', e));
}
```

3. After the `isInitialized` block, update saved:
```typescript
this.saved<Name> = current<Name>;
```

**Why the `isInitialized` guard matters**: the very first `applyStatus` call happens at startup when setting initial values. Without the guard, every device boot fires every trigger card, spamming the user's flows.

---

## Condition cards

### JSON: `.homeycompose/flow/conditions/<id>.json`

```json
{
  "id": "<id>",
  "title": {
    "en": "<Thing> is ...",
    "sv": "...", ...
  },
  "args": [
    {
      "name": "device",
      "type": "device",
      "filter": "driver_id=<driver>"
    },
    {
      "name": "argument_main",
      "type": "dropdown",
      "values": [
        { "id": "excellent", "label": { "en": "Excellent (< 12 µg/m³)", "sv": "...", ... } },
        { "id": "good",      "label": { "en": "Good (12–35 µg/m³)",      "sv": "...", ... } },
        { "id": "fair",      "label": { "en": "Fair (35–55 µg/m³)",      "sv": "...", ... } },
        { "id": "poor",      "label": { "en": "Poor (55–150 µg/m³)",     "sv": "...", ... } },
        { "id": "verypoor",  "label": { "en": "Very poor (> 150 µg/m³)", "sv": "...", ... } }
      ]
    }
  ]
}
```

### TypeScript: register in `setupListeners()`

```typescript
this.homey.flow.getConditionCard('<id>').registerRunListener(async (args) =>
  conditionScore<Thing>ToString(this.getCapabilityValue('<capability>')) === args.argument_main
);
```

The `conditionScore*ToString` functions live in `drivers/BlueAirAwsUtils.ts`. If the sensor type has no converter, write one there using the same `AirQuality` enum pattern.

---

## Checklist

- [ ] JSON file created with all 13 locales in titles/hints/labels
- [ ] `driver_id` filter set correctly in `args[0]`
- [ ] TypeScript registration added in `setupListeners()` of correct device class
- [ ] For triggers: saved-value field added, `isInitialized` guard in place, saved-value updated after block
- [ ] For actions: `performSet*` method exists or is created in `BlueAirAwsBaseDevice`
- [ ] `npm run build` passes
