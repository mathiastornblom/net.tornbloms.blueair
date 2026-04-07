import { Device } from 'homey'; // Import the base Device class from the Homey SDK
import { ApiClient } from 'blueair-client'; // Import the ApiClient from the blueair-client library

/**
 * Represents a setting object for the BlueAir device.
 * The Setting interface is used to define objects that have a name and other optional properties.
 */
interface Setting {
  name: string;
  [key: string]: any; // This allows for other properties in the setting object.
}

/**
 * BlueAirClassicDevice class extends the Homey Device class.
 * It manages the interactions between the Homey platform and the BlueAir device.
 */
class BlueAirClassicDevice extends Device {
  // Property to store the saved fan speed setting
  private _savedfanspeed: Setting | null | undefined;

  // Define interval ID properties to store interval identifiers
  private intervalId1: ReturnType<typeof setInterval> | null = null; // For the first setInterval
  private intervalId2: ReturnType<typeof setInterval> | null = null; // For the second setInterval

  /**
   * onInit is called when the device is initialized.
   * This function sets up the device by registering capability listeners and starting data-fetching intervals.
   */
  async onInit(): Promise<void> {
    const settings = this.getSettings(); // Retrieve device settings from Homey
    const data = this.getData(); // Retrieve device-specific data (e.g., UUID)
    const userId = this.getStoreValue('userId'); // Retrieve user ID from Homey's storage

    // Add capabilities if they are not already present
    const capabilities = [
      'fan_speed',
      'brightness',
      'child_lock',
      'last_retrieval_date',
      'wifi_status',
      'filter_status',
    ];

    for (const capability of capabilities) {
      if (!this.hasCapability(capability)) {
        await this.addCapability(capability);
      }
    }

    // Migrate old misspelled capability to the corrected name
    if (this.hasCapability('last_retrieval_date')) {
      const oldValue = this.getCapabilityValue('last_retrieval_date');
      if (oldValue) {
        await this.setCapabilityValue('last_retrieval_date', oldValue).catch(this.error);
      }
      await this.removeCapability('last_retrieval_date');
    }

    try {
      // Initialize the API client for BlueAir with the username and password from settings
      const client = new ApiClient(settings.username, settings.password);
      await client.initialize();

      // Fetch device attributes and information from BlueAir API
      const DeviceAttributes = await client.getDeviceAttributes(data.uuid);
      const DeviceInfo = await client.getDeviceInfo(data.uuid);

      // Save the current fan speed setting for comparison in updates
      this._savedfanspeed = this.filterSettings(DeviceAttributes, 'fan_speed');

      // Register a listener for changes to the fan speed capability
      this.registerCapabilityListener('fan_speed', async (value) => {
        const result = this.filterSettings(DeviceAttributes, 'fan_speed');
        if (value === 'auto') {
          this.log('Changed fan speed: Auto');
          await client.setFanAuto(data.uuid, 'auto', 'auto', userId); // Set fan to auto mode
        } else {
          this.log('Changed fan speed:', value);
          await client.setFanSpeed(
            data.uuid,
            value,
            result?.defaultValue,
            userId
          ); // Set fan to manual speed
          await client.setFanAuto(data.uuid, 'manual', 'manual', userId); // Ensure fan is in manual mode
        }
      });

      // Register a listener for changes to the brightness capability
      this.registerCapabilityListener('brightness', async (value) => {
        const result = this.filterSettings(DeviceAttributes, 'brightness');
        this.log('Changed brightness:', value);
        await client.setBrightness(
          data.uuid,
          String(value),
          result?.defaultValue,
          userId
        );
      });

      // Register a listener for changes to the child lock capability
      this.registerCapabilityListener('child_lock', async (value) => {
        const result = this.filterSettings(DeviceAttributes, 'child_lock');
        if (value) {
          this.log('Changed child lock:', value);
          await client.setChildLock(
            data.uuid,
            '1',
            result?.defaultValue,
            userId
          ); // Enable child lock
        } else {
          this.log('Changed child lock:', value);
          await client.setChildLock(
            data.uuid,
            '0',
            result?.defaultValue,
            userId
          ); // Disable child lock
        }
      });

      // Retrieve and set initial capability values from the device's attributes
      const resultFanSpeed = this.filterSettings(DeviceAttributes, 'fan_speed');
      const resultBrightness = this.filterSettings(
        DeviceAttributes,
        'brightness'
      );
      const resultChildLock = this.filterSettings(
        DeviceAttributes,
        'child_lock'
      );
      const resultFilterStatus = this.filterSettings(
        DeviceAttributes,
        'filter_status'
      );
      const resultWiFiStatus = this.filterSettings(
        DeviceAttributes,
        'wifi_status'
      );

      // Set capability values for fan speed, brightness, and child lock
      this.setCapabilityValue('fan_speed', resultFanSpeed?.currentValue).catch(
        this.error
      );
      this.setCapabilityValue(
        'brightness',
        parseInt(resultBrightness?.currentValue, 10)
      ).catch(this.error);

      if (resultChildLock?.currentValue === 1) {
        this.setCapabilityValue('child_lock', true).catch(this.error);
      } else {
        this.setCapabilityValue('child_lock', false).catch(this.error);
      }

      // Set capability values for last retrieval date, Wi-Fi status, and filter status
      this.setCapabilityValue(
        'last_retrieval_date',
        this.timeConverter(DeviceInfo.lastSyncDate)
      ).catch(this.error);

      if (resultWiFiStatus?.currentValue === '1') {
        this.setCapabilityValue('wifi_status', true).catch(this.error);
      } else {
        this.setCapabilityValue('wifi_status', false).catch(this.error);
      }

      this.setCapabilityValue(
        'filter_status',
        resultFilterStatus?.currentValue
      ).catch(this.error);

      // Update device settings with the latest information from the API
      this.setSettings({
        uuid: DeviceInfo.uuid,
        name: DeviceInfo.name,
        compatibility: DeviceInfo.compatibility,
        model: DeviceInfo.model,
        mac: DeviceInfo.mac,
        firmware: DeviceInfo.firmware,
        mcuFirmware: DeviceInfo.mcuFirmware,
        wlanDriver: DeviceInfo.wlanDriver,
        lastSyncDate: this.timeConverter(DeviceInfo.lastSyncDate),
        installationDate: this.timeConverter(DeviceInfo.installationDate),
        lastCalibrationDate: this.timeConverter(DeviceInfo.lastCalibrationDate),
        initUsagePeriod: String(DeviceInfo.initUsagePeriod),
        rebootPeriod: String(DeviceInfo.rebootPeriod),
        roomLocation: DeviceInfo.roomLocation,
      });

      // Start an interval to periodically fetch and update device attributes
      this.intervalId1 = setInterval(async () => {
        try {
          this.log('setInternal: ', settings.update * 1000);
          const DeviceAttributes = await client.getDeviceAttributes(data.uuid);
          const DeviceInfo = await client.getDeviceInfo(data.uuid);

          const resultFanSpeed = this.filterSettings(
            DeviceAttributes,
            'fan_speed'
          );
          const resultBrightness = this.filterSettings(
            DeviceAttributes,
            'brightness'
          );
          const resultChildLock = this.filterSettings(
            DeviceAttributes,
            'child_lock'
          );
          const resultFilterStatus = this.filterSettings(
            DeviceAttributes,
            'filter_status'
          );
          const resultWiFiStatus = this.filterSettings(
            DeviceAttributes,
            'wifi_status'
          );

          // Update capability values based on the fetched data
          this.setCapabilityValue(
            'fan_speed',
            resultFanSpeed?.currentValue
          ).catch(this.error);
          this.setCapabilityValue(
            'brightness',
            parseInt(resultBrightness?.currentValue, 10)
          ).catch(this.error);

          if (resultChildLock?.currentValue === 1) {
            this.setCapabilityValue('child_lock', true).catch(this.error);
          } else {
            this.setCapabilityValue('child_lock', false).catch(this.error);
          }

          this.setCapabilityValue(
            'last_retrieval_date',
            this.timeConverter(DeviceInfo.lastSyncDate)
          ).catch(this.error);

          if (resultWiFiStatus?.currentValue === '1') {
            this.setCapabilityValue('wifi_status', true).catch(this.error);
          } else {
            this.setCapabilityValue('wifi_status', false).catch(this.error);
          }

          this.setCapabilityValue(
            'filter_status',
            resultFilterStatus?.currentValue
          ).catch(this.error);

          // Trigger a flow card if the fan speed has changed
          if (
            this._savedfanspeed?.currentValue !== resultFanSpeed?.currentValue
          ) {
            const cardTriggerFilter = this.homey.flow.getTriggerCard(
              'fan-speed-has-changed'
            );

            // Ensure the fan speed is defined and convert to a string if necessary
            const fanSpeedValue = resultFanSpeed?.currentValue
              ? String(resultFanSpeed.currentValue)
              : '';
            if (fanSpeedValue) {
              cardTriggerFilter.trigger({
                'device-name': settings.name,
                'device-uuid': settings.uuid,
                'fan speed': fanSpeedValue,
              });
              this._savedfanspeed = resultFanSpeed; // Update the saved fan speed
            } else {
              this.log(
                'Fan speed value is undefined or invalid, cannot trigger flow card.'
              );
            }
          }
        } catch (error) {
          this.log('Error in interval 1:', error); // Log any errors encountered
        }
      }, settings.update * 1000); // Interval frequency is determined by the update setting

      // Start another interval to check for changes in filter status
      this.intervalId2 = setInterval(async () => {
        try {
          this.setSettings({
            uuid: DeviceInfo.uuid,
            name: DeviceInfo.name,
            compatibility: DeviceInfo.compatibility,
            model: DeviceInfo.model,
            mac: DeviceInfo.mac,
            firmware: DeviceInfo.firmware,
            mcuFirmware: DeviceInfo.mcuFirmware,
            wlanDriver: DeviceInfo.wlanDriver,
            lastSyncDate: this.timeConverter(DeviceInfo.lastSyncDate),
            installationDate: this.timeConverter(DeviceInfo.installationDate),
            lastCalibrationDate: this.timeConverter(
              DeviceInfo.lastCalibrationDate
            ),
            initUsagePeriod: String(DeviceInfo.initUsagePeriod),
            rebootPeriod: String(DeviceInfo.rebootPeriod),
            roomLocation: DeviceInfo.roomLocation,
          });
        } catch (error) {
          this.log('Error in interval 2:', error); // Log any errors encountered
        }
      }, 60000); // This interval runs every minute

      // Register action card listeners for controlling fan speed
      const fancard = this.homey.flow.getActionCard('set-fan-speed');
      fancard.registerRunListener(async (value) => {
        this.log('Want to change the fan speed with value: ', value.fanspeed);
        if (value.speed === 'auto') {
          this.log('Changed fan speed to:', value.fanspeed);
          await client.setFanAuto(data.uuid, 'auto', 'auto', userId);
        } else {
          this.log('Changed fan speed:', value.fanspeed);
          await client.setFanSpeed(
            data.uuid,
            value.fanspeed,
            value.fanspeed,
            userId
          );
          await client.setFanAuto(data.uuid, 'manual', 'manual', userId);
        }
      });

      // Register action card listeners for controlling brightness
      const brightnesscard = this.homey.flow.getActionCard('set-brightness');
      brightnesscard.registerRunListener(async (value) => {
        this.log(
          'Want to change the brightness with value: ',
          value.brightness
        );
        await client.setBrightness(
          data.uuid,
          value.brightness,
          value.brightness,
          userId
        );
        this.log('Changed brightness to:', value.brightness);
      });

      // Register action card listeners for controlling child lock
      const childlockcard = this.homey.flow.getActionCard('set-childlock');
      childlockcard.registerRunListener(async (value) => {
        this.log('Want to change the child lock with value: ', value.childlock);
        await client.setChildLock(
          data.uuid,
          value.brightness,
          value.brightness,
          userId
        );
        this.log('Changed child lock:', value.childlock);
      });

      this.log('BlueAirClassicDevice has been initialized'); // Log device initialization
    } catch (e) {
      this.log('Error during initialization:', e); // Log any initialization errors
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   * This method logs when the device is successfully added.
   */
  async onAdded(): Promise<void> {
    this.log('BlueAirClassicDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * This method can be used to apply new settings to the device.
   *
   * @param {object} event - The onSettings event data
   * @param {object} event.oldSettings - The old settings object
   * @param {object} event.newSettings - The new settings object
   * @param {string[]} event.changedKeys - An array of keys changed since the previous version
   * @returns {Promise<string|void>} - Return a custom message that will be displayed
   */
  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: {
      [key: string]: boolean | string | number | undefined | null;
    };
    newSettings: {
      [key: string]: boolean | string | number | undefined | null;
    };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('BlueAirClassicDevice settings were changed'); // Log when settings are changed
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used to synchronize the new name to the device.
   *
   * @param name - The new name for the device
   */
  async onRenamed(name: string): Promise<void> {
    this.log('BlueAirClassicDevice was renamed'); // Log when the device is renamed
  }

  /**
   * onDeleted is called when the user deletes the device.
   * This method ensures that any active intervals are cleared to prevent continued operations.
   */
  async onDeleted(): Promise<void> {
    this.log('BlueAirClassicDevice has been deleted');

    // Clear the first interval if it's active
    if (this.intervalId1) {
      clearInterval(this.intervalId1);
      this.log('Interval 1 cleared'); // Log clearing of the first interval
      this.intervalId1 = null; // Reset the interval ID
    }

    // Clear the second interval if it's active
    if (this.intervalId2) {
      clearInterval(this.intervalId2);
      this.log('Interval 2 cleared'); // Log clearing of the second interval
      this.intervalId2 = null; // Reset the interval ID
    }

    // Additional cleanup if necessary
    this._savedfanspeed = null;
  }

  /**
   * Converts a UNIX timestamp to a human-readable date-time string based on language.
   * This utility function helps to present timestamps in a user-friendly format.
   *
   * @param unixTimeStamp - The UNIX timestamp to be converted.
   * @returns A string representation of the date and time based on the language.
   */
  timeConverter(this: any, unixTimeStamp: number): string {
    const a: Date = new Date(unixTimeStamp * 1000); // Convert UNIX timestamp to a Date object

    /**
     * Helper function to ensure numbers are represented with two digits.
     *
     * @param n - The number to be padded.
     * @returns A string representation of the number, padded with a leading zero if the number is less than 10.
     */
    function pad(n: number): string {
      return n < 10 ? `0${n}` : n.toString(); // Pad numbers with leading zero if necessary
    }

    const year: number = a.getFullYear(); // Get the year
    const month: string = pad(a.getMonth() + 1); // Get the month (0-indexed, so add 1)
    const date: string = pad(a.getDate()); // Get the day of the month
    const hour: string = pad(a.getHours()); // Get the hour
    const min: string = pad(a.getMinutes()); // Get the minute
    const sec: string = pad(a.getSeconds()); // Get the second

    let time: string;
    const lang = this.homey.i18n.getLanguage(); // Get the current language setting
    switch (lang) {
      case 'en':
        time = `${year}-${month}-${date} ${hour}:${min}:${sec}`; // Format: YYYY-MM-DD HH:MM:SS
        break;
      case 'nl':
      case 'da':
        time = `${date}-${month}-${year} ${hour}:${min}:${sec}`; // Format: DD-MM-YYYY HH:MM:SS
        break;
      case 'de':
      case 'no':
      case 'ru':
        time = `${date}.${month}.${year} ${hour}:${min}:${sec}`; // Format: DD.MM.YYYY HH:MM:SS
        break;
      case 'fr':
      case 'it':
      case 'es':
        time = `${date}/${month}/${year} ${hour}:${min}:${sec}`; // Format: DD/MM/YYYY HH:MM:SS
        break;
      case 'sv':
      case 'pl':
        time = `${year}-${month}-${date} ${hour}:${min}:${sec}`; // Format: YYYY-MM-DD HH:MM:SS
        break;
      default:
        time = `${year}-${month}-${date} ${hour}:${min}:${sec}`; // Default format: YYYY-MM-DD HH:MM:SS
    }

    return time;
  }

  /**
   * Filters the settings array to find a setting by its name.
   * This function searches through the device's settings to find specific configuration parameters.
   *
   * @param settings - An array of settings to search through.
   * @param name - The name of the setting to search for.
   * @returns The found setting or null if not found.
   */
  filterSettings(settings: Setting[], name: string): Setting | null {
    if (!Array.isArray(settings)) {
      this.log('Settings is not an array', settings); // Log if settings are not an array
      return null;
    }
    const setting: Setting | undefined = settings.find(
      (s: Setting) => s.name === name
    );
    return setting || null; // Return the found setting or null if not found
  }
}

module.exports = BlueAirClassicDevice; // Export the BlueAirClassicDevice class for use by Homey
