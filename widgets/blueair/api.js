'use strict';

// Capabilities surfaced by the air quality widget
const AIR_CAPS = [
  'measure_pm25',
  'measure_pm1',
  'measure_pm10',
  'measure_tvoc',
  'measure_humidity',
  'measure_temperature',
  'fanspeed',
  'filter_status',
  'wifi_status',
];

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
        driverId: d.driverId,
        capabilities: d.capabilities || [],
      }));
  },

  /**
   * GET /device/:deviceId/values
   * Returns the current value for every air-quality capability the device has.
   */
  async getDeviceValues(homey, params) {
    const { deviceId } = params;
    const device = await homey.devices.getDevice({ id: deviceId });
    if (!device) throw new Error(`Device ${deviceId} not found`);

    const result = {};
    for (const cap of AIR_CAPS) {
      if (device.capabilities?.includes(cap)) {
        result[cap] = device.capabilitiesObj?.[cap]?.value ?? null;
      }
    }
    return result;
  },
};
