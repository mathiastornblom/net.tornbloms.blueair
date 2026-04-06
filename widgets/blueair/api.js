module.exports = {
  async getBlueAirDevices(homey) {
    // 1) Get all devices from Homey
    const devices = await homey.devices.getDevices();

    // 2) Filter only the ones we consider "BlueAir devices"
    //    (for example, by driverId or something else)
    const blueAirDevices = Object.values(devices).filter((device) => {
      return device.driverUri === 'homey:net.tornbloms.blueair';
    });

    // 3) Return an array of simplified device info (id + name)
    return blueAirDevices.map((d) => ({
      id: d.id,
      name: d.name || 'Unnamed BlueAir Device',
    }));
  },

  /**
   * GET /devices/:deviceId/capabilities
   * Returns a list of capabilities for a specific device.
   *
   * @param {object} homey - The Homey object provided by the SDK
   * @param {object} params - The URL parameters, e.g. { deviceId: 'abc123' }
   * @returns {Promise<Array>} - An array of { id, label } for each capability
   */
  async getBlueAirCapabilities(homey, params) {
    const { deviceId } = params;

    // 1) Get the device by ID
    const device = await homey.devices.getDevice({ id: deviceId });
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    // 2) Capabilities might be found in "device.capabilities" (array)
    //    or "device.capabilitiesObj" (detailed object)
    if (!device.capabilities) {
      return [];
    }

    // 3) Map to a simple { id, label } structure
    return device.capabilities.map((cap) => ({
      id: cap,
      // For demo: just use capability ID as label
      // Optionally you could do a dictionary or check device.capabilitiesObj for a better name
      label: cap,
    }));
  },

  /**
   * GET /devices/:deviceId/capabilities/:capabilityId
   * Returns the current value for a given capability on a specific device.
   *
   * @param {object} homey - The Homey object provided by the SDK
   * @param {object} params - The URL parameters, e.g. { deviceId: 'abc123', capabilityId: 'measure_pm25' }
   * @returns {Promise<any>} - The current value of the capability
   */
  async getBlueAirCapabilityValue(homey, params) {
    const { deviceId, capabilityId } = params;

    // 1) Get the device
    const device = await homey.devices.getDevice({ id: deviceId });
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    // 2) Read the capability value
    //    The actual location might differ; often it's device.capabilitiesObj[capabilityId!]?.value ?? null;

    // 3) Return the value (could be number, string, boolean, etc.)
    return currentValue;
  },
};
