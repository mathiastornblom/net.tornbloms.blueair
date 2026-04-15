'use strict';

// Capabilities that may be controlled via this widget
const CONTROL_CAPS = ['fanspeed', 'automode', 'nightmode', 'standby', 'child_lock'];

module.exports = {
  /**
   * GET /devices
   * Returns all BlueAir devices known to this app.
   */
  async getDevices(homey) {
    const all = await homey.devices.getDevices();
    return Object.values(all)
      .filter((d) => (d.driverUri || '').includes('net.tornbloms.blueair'))
      .map((d) => ({
        id: d.id,
        name: d.name || 'Unnamed Device',
        capabilities: d.capabilities || [],
      }));
  },

  /**
   * GET /device/:deviceId/state
   * Returns the current value of every controllable capability the device has.
   */
  async getDeviceState(homey, params) {
    const { deviceId } = params;
    const device = await homey.devices.getDevice({ id: deviceId });
    if (!device) throw new Error(`Device ${deviceId} not found`);

    const state = {};
    for (const cap of CONTROL_CAPS) {
      if (device.capabilities?.includes(cap)) {
        state[cap] = device.capabilitiesObj?.[cap]?.value ?? null;
      }
    }
    return { capabilities: device.capabilities || [], state };
  },

  /**
   * POST /device/:deviceId/capability/:capabilityId
   * Sets a controllable capability value. Body: { value: <boolean|number> }
   */
  async setCapability(homey, params, body) {
    const { deviceId, capabilityId } = params;

    if (!CONTROL_CAPS.includes(capabilityId)) {
      throw new Error(`Capability "${capabilityId}" is not controllable via this widget`);
    }

    const device = await homey.devices.getDevice({ id: deviceId });
    if (!device) throw new Error(`Device ${deviceId} not found`);

    await device.setCapabilityValue(capabilityId, body.value);
    return { ok: true };
  },
};
