import { Device } from 'homey';
import { BlueAirAwsClient } from 'blueairaws-client';
import BlueAirAwsBaseDriver from '../BlueAirAwsBaseDriver';
import {
  BlueAirDeviceStatus,
  BlueAirDeviceState,
  BlueAirDeviceSensorData,
} from 'blueairaws-client/dist/Consts';
import {
  conditionScorePm25ToString,
  conditionScorePm1ToString,
  conditionScorePm10ToString,
  conditionScoretVOCToString,
} from '../BlueAirAwsUtils';

/**
 * Represents a setting object.
 * This interface allows additional properties, accommodating any setting that might be required.
 */
interface Setting {
  name: string;
  [key: string]: any; // This allows for other properties in the setting object.
}

/**
 * Filters the device attributes array to find a specified item value.
 * @param devices - An array of BlueAirDeviceStatus objects to search through.
 * @param itemName - The name of the item to search for (e.g., 'fanspeed', 'childlock').
 * @returns The Setting object of the found item or null if not found.
 */
function filterSettings(
  devices: BlueAirDeviceStatus[],
  itemName: string
): Setting | null {
  for (const device of devices) {
    // Check if itemName exists in the state
    if (itemName in device.state) {
      const stateValue = device.state[itemName as keyof BlueAirDeviceState];
      if (stateValue !== undefined && stateValue !== null) {
        return { name: itemName, value: String(stateValue) }; // Return a Setting object
      }
    }

    // Check if itemName exists in the sensorData
    if (itemName in device.sensorData) {
      const sensorDataValue =
        device.sensorData[itemName as keyof BlueAirDeviceSensorData];
      if (sensorDataValue !== undefined && sensorDataValue !== null) {
        return { name: itemName, value: String(sensorDataValue) }; // Return a Setting object
      }
    }
  }

  return null; // Return null if the item is not found in any device
}

/**
 * Represents the BlueAir HealthProtect device.
 * This class is responsible for managing the device's capabilities and settings within the Homey app.
 */
class BlueAirHealthProtectDevice extends Device {
  private savedfanspeed: Setting | null = null;
  private savedPM1: Setting | null = null;
  private savedPM25: Setting | null = null;
  private savedPM10: Setting | null = null;
  private savedtVOC: Setting | null = null;
  private savedHumidity: Setting | null = null;
  private savedTemperature: Setting | null = null;
  private savedFilterStatus: string | null = null;
  private client: BlueAirAwsClient | null = null; // Shared client from driver

  private intervalId1: ReturnType<typeof setInterval> | null = null;
  private intervalId2: ReturnType<typeof setInterval> | null = null;

  /**
   * onInit is called when the device is initialized.
   * This method sets up capability listeners and initializes the device's settings.
   */
  async onInit(): Promise<void> {
    const settings = this.getSettings(); // Retrieve settings from Homey
    const data = this.getData(); // Retrieve data from Homey

    this.log(
      'Initializing BlueAirHealthProtect Device with settings:',
      settings
    );

    if (this.hasCapability('measure_tVOC')) {
      // You need to check if migration is needed
      // do not call removeCapability on every init!
      await this.removeCapability('measure_tVOC');
    }

    // Add capabilities if they are not already present
    const capabilities = [
      'automode',
      'brightness2',
      'child_lock',
      'fanspeed',
      'filter_status',
      'measure_humidity',
      'measure_pm1',
      'measure_pm10',
      'measure_pm25',
      'measure_temperature',
      'measure_tvoc',
      'nightmode',
      'standby',
      'wifi_status',
    ];

    for (const capability of capabilities) {
      if (!this.hasCapability(capability)) {
        await this.addCapability(capability);
      }
    }

    try {
      // Get or create the shared client from the driver (avoids parallel Gigya logins)
      const driver = this.driver as BlueAirAwsBaseDriver;
      this.client = await driver.getOrCreateClient(settings.username, settings.password);
      const client = this.client;
      this.log('AccountUUID:', data.accountuuid);

      // Fetch the initial device attributes for the specific device
      const DeviceAttributes = await client.getDeviceStatus(data.accountuuid, [
        data.uuid,
      ]);
      this.log('DeviceAttributes:', DeviceAttributes);

      // Retrieve initial device settings and store them in class properties
      this.savedfanspeed = filterSettings(DeviceAttributes, 'fanspeed');
      this.savedHumidity = filterSettings(DeviceAttributes, 'humidity');
      this.savedTemperature = filterSettings(DeviceAttributes, 'temperature');
      this.savedPM1 = filterSettings(DeviceAttributes, 'pm1');
      this.savedPM25 = filterSettings(DeviceAttributes, 'pm2_5');
      this.savedPM10 = filterSettings(DeviceAttributes, 'pm10');
      this.savedtVOC = filterSettings(DeviceAttributes, 'tvoc');
      this.savedFilterStatus =
        this.calculateRemainingFilterLife(DeviceAttributes);

      // Register capability listeners to handle user interactions

      // Fan Speed Listener
      this.registerCapabilityListener('fanspeed', async (value) => {
        this.log('Changed fan speed:', value);
        await client.setFanSpeed(data.uuid, value); // Send updated fan speed to the device via API

        // Re-fetch updated device status after setting the new value
        const updatedDeviceAttributes = await client.getDeviceStatus(
          data.accountuuid,
          [data.uuid]
        );
        const result = filterSettings(updatedDeviceAttributes, 'fanspeed');

        // Update the capability with the latest value from the device
        this.setCapabilityValue('fanspeed', Number(result?.value ?? 0)).catch(
          this.error
        );

        // Log and debug the result from the API call
        this.log('Filtered fan speed settings:', result);
      });

      // Auto Mode Listener
      this.registerCapabilityListener('automode', async (value) => {
        this.log('Changed automode:', value);
        await client.setFanAuto(data.uuid, value); // Send updated automode to the device via API

        // Re-fetch updated device status after setting the new value
        const updatedDeviceAttributes = await client.getDeviceStatus(
          data.accountuuid,
          [data.uuid]
        );
        const result = filterSettings(updatedDeviceAttributes, 'automode');

        // Update the capability with the latest value from the device
        this.setCapabilityValue('automode', result?.value === 'true').catch(
          this.error
        );

        // Log and debug the result from the API call
        this.log('Filtered automode settings:', result);
      });

      // Brightness Listener
      this.registerCapabilityListener('brightness2', async (value) => {
        this.log('Changed brightness:', value);
        await client.setBrightness(data.uuid, value); // Send updated brightness to the device via API

        // Re-fetch updated device status after setting the new value
        const updatedDeviceAttributes = await client.getDeviceStatus(
          data.accountuuid,
          [data.uuid]
        );
        const result = filterSettings(updatedDeviceAttributes, 'brightness');

        // Update the capability with the latest value from the device
        this.setCapabilityValue(
          'brightness2',
          Number(result?.value ?? 0)
        ).catch(this.error);

        // Log and debug the result from the API call
        this.log('Filtered brightness settings:', result);
      });

      // Child Lock Listener
      this.registerCapabilityListener('child_lock', async (value) => {
        this.log('Changed child lock:', value);
        await client.setChildLock(data.uuid, value); // Send updated child lock status to the device via API

        // Re-fetch updated device status after setting the new value
        const updatedDeviceAttributes = await client.getDeviceStatus(
          data.accountuuid,
          [data.uuid]
        );
        const result = filterSettings(updatedDeviceAttributes, 'childlock');

        // Update the capability with the latest value from the device
        this.setCapabilityValue('child_lock', result?.value === 'true').catch(
          this.error
        );

        // Log and debug the result from the API call
        this.log('Filtered child lock settings:', result);
      });

      // Night Mode Listener
      this.registerCapabilityListener('nightmode', async (value) => {
        this.log('Changed night mode:', value);
        await client.setNightMode(data.uuid, value); // Send updated night mode status to the device via API

        // Re-fetch updated device status after setting the new value
        const updatedDeviceAttributes = await client.getDeviceStatus(
          data.accountuuid,
          [data.uuid]
        );
        const result = filterSettings(updatedDeviceAttributes, 'nightmode');

        // Update the capability with the latest value from the device
        this.setCapabilityValue('nightmode', result?.value === 'true').catch(
          this.error
        );

        // Log and debug the result from the API call
        this.log('Filtered night mode settings:', result);
      });

      // Standby Listener
      this.registerCapabilityListener('standby', async (value) => {
        this.log('Changed standby:', value);
        await client.setStandby(data.uuid, !value); // Send updated standby status to the device via API
        // Notice the inversion with `!value` to match device expectations

        // Re-fetch updated device status after setting the new value
        const updatedDeviceAttributes = await client.getDeviceStatus(
          data.accountuuid,
          [data.uuid]
        );
        const result = filterSettings(updatedDeviceAttributes, 'standby');

        // Update the capability with the latest value from the device
        this.setCapabilityValue('standby', result?.value === 'false').catch(
          this.error
        );
        // Use `result?.value === 'false'` to reflect "on" when standby is `false`

        // Log and debug the result from the API call
        this.log('Filtered standby settings:', result);
      });

      // Fetch and set initial states for all capabilities

      const resultFanSpeed = filterSettings(DeviceAttributes, 'fanspeed');
      const resultHumidity = filterSettings(DeviceAttributes, 'humidity');
      const resultTemperature = filterSettings(DeviceAttributes, 'temperature');
      const resultPM1 = filterSettings(DeviceAttributes, 'pm1');
      const resultPM25 = filterSettings(DeviceAttributes, 'pm2_5');
      const resultPM10 = filterSettings(DeviceAttributes, 'pm10');
      const resulttVOC = filterSettings(DeviceAttributes, 'tvoc');
      const resultBrightness = filterSettings(DeviceAttributes, 'brightness');
      const resultChildLock = filterSettings(DeviceAttributes, 'childlock');
      const resultNightMode = filterSettings(DeviceAttributes, 'nightmode');
      const resultStandby = filterSettings(DeviceAttributes, 'standby');
      const resultFilterStatus = filterSettings(
        DeviceAttributes,
        'filterusage'
      );
      const resultWiFiStatus = filterSettings(DeviceAttributes, 'online');
      const resultAutoMode = filterSettings(DeviceAttributes, 'automode'); // Fetch automode

      // Log initial capability values for debugging
      this.log('Initial fanspeed:', resultFanSpeed);
      this.log('Initial humidity:', resultHumidity);
      this.log('Initial temperature:', resultTemperature);
      this.log('Initial PM1:', resultPM1);
      this.log('Initial PM2.5:', resultPM25);
      this.log('Initial PM10:', resultPM10);
      this.log('Initial tVOC:', resulttVOC);
      this.log('Initial brightness:', resultBrightness);
      this.log('Initial child_lock:', resultChildLock);
      this.log('Initial night mode:', resultNightMode);
      this.log('Initial standby:', resultStandby);
      this.log('Initial wifi_status:', resultWiFiStatus);
      this.log('Initial filter_status:', resultFilterStatus);
      this.log('Initial automode:', resultAutoMode);

      // Set initial capability values, converting to correct types as needed
      this.setCapabilityValue(
        'fanspeed',
        Number(resultFanSpeed?.value ?? 0) // Parse fan speed as a number
      ).catch(this.error);

      this.setCapabilityValue(
        'measure_humidity',
        Number(resultHumidity?.value ?? 0) // Parse humidity as a number
      ).catch(this.error);

      this.setCapabilityValue(
        'measure_temperature',
        Number(resultTemperature?.value ?? 0) // Parse temperature as a number
      ).catch(this.error);

      this.setCapabilityValue(
        'measure_pm1',
        Number(resultPM1?.value ?? 0) // Parse PM1 value as a number
      ).catch(this.error);

      this.setCapabilityValue(
        'measure_pm25',
        Number(resultPM25?.value ?? 0) // Parse PM2.5 value as a number
      ).catch(this.error);

      this.setCapabilityValue(
        'measure_pm10',
        Number(resultPM10?.value ?? 0) // Parse PM10 value as a number
      ).catch(this.error);

      this.setCapabilityValue(
        'measure_tvoc',
        Number(resulttVOC?.value ?? 0) // Parse tVOC value as a number
      ).catch(this.error);

      this.setCapabilityValue(
        'brightness2',
        Number(resultBrightness?.value ?? 0) // Parse brightness as a number
      ).catch(this.error);

      this.setCapabilityValue(
        'child_lock',
        resultChildLock?.value === 'true' // Convert child lock status to a boolean
      ).catch(this.error);

      this.setCapabilityValue(
        'nightmode',
        resultNightMode?.value === 'true' // Convert night mode status to a boolean
      ).catch(this.error);

      this.setCapabilityValue(
        'standby',
        resultStandby?.value === 'false' // Invert logic for standby
      ).catch(this.error);

      this.setCapabilityValue(
        'wifi_status',
        resultWiFiStatus?.value === 'true' // Convert WiFi status to a boolean
      ).catch(this.error);

      this.setCapabilityValue(
        'filter_status',
        this.calculateRemainingFilterLife(DeviceAttributes) // Calculate and set the remaining filter life
      ).catch(this.error);

      this.setCapabilityValue(
        'automode',
        resultAutoMode?.value === 'true' // Convert automode status to a boolean
      ).catch(this.error);

      // Store device information in settings
      this.setSettings({
        uuid: DeviceAttributes[0].id, // Device UUID
        name: DeviceAttributes[0].name, // Device name
        model: DeviceAttributes[0].model, // Device model
        mac: DeviceAttributes[0].mac, // Device MAC address
        serial: DeviceAttributes[0].serial, // Device serial number
        mcuFirmware: DeviceAttributes[0].mcu, // Device MCU firmware version
        wlanDriver: DeviceAttributes[0].wifi, // Device WLAN driver version
      });

      // Periodic updates for capabilities to reflect real-time changes
      this.intervalId1 = setInterval(async () => {
        this.log(
          'Executing periodic update at interval:',
          settings.update * 1000
        );

        // Fetch updated device attributes
        const DeviceAttributes = await client.getDeviceStatus(
          data.accountuuid,
          [data.uuid]
        );

        // Fetch updated states for each capability
        const resultFanSpeed = filterSettings(DeviceAttributes, 'fanspeed');
        const resultHumidity = filterSettings(DeviceAttributes, 'humidity');
        const resultTemperature = filterSettings(
          DeviceAttributes,
          'temperature'
        );
        const resultPM1 = filterSettings(DeviceAttributes, 'pm1');
        const resultPM25 = filterSettings(DeviceAttributes, 'pm2_5');
        const resultPM10 = filterSettings(DeviceAttributes, 'pm10');
        const resulttVOC = filterSettings(DeviceAttributes, 'tvoc');
        const resultBrightness = filterSettings(DeviceAttributes, 'brightness');
        const resultChildLock = filterSettings(DeviceAttributes, 'childlock');
        const resultNightMode = filterSettings(DeviceAttributes, 'nightmode');
        const resultStandby = filterSettings(DeviceAttributes, 'standby');
        const resultFilterStatus = filterSettings(
          DeviceAttributes,
          'filterusage'
        );
        const resultWiFiStatus = filterSettings(DeviceAttributes, 'online');
        const resultAutoMode = filterSettings(DeviceAttributes, 'automode'); // Fetch automode

        // Log updated capability values for debugging
        this.log('Updated fanspeed:', resultFanSpeed);
        this.log('Updated humidity:', resultHumidity);
        this.log('Updated temperature:', resultTemperature);
        this.log('Updated PM1:', resultPM1);
        this.log('Updated PM2.5:', resultPM25);
        this.log('Updated PM10:', resultPM10);
        this.log('Updated tVOC:', resulttVOC);
        this.log('Updated brightness:', resultBrightness);
        this.log('Updated child_lock:', resultChildLock);
        this.log('Updated night mode:', resultNightMode);
        this.log('Updated standby:', resultStandby);
        this.log('Updated wifi_status:', resultWiFiStatus);
        this.log('Updated filter_status:', resultFilterStatus);
        this.log('Updated automode:', resultAutoMode);

        // Update capabilities with new values
        this.setCapabilityValue(
          'fanspeed',
          Number(resultFanSpeed?.value ?? 0)
        ).catch(this.error);
        this.setCapabilityValue(
          'measure_humidity',
          Number(resultHumidity?.value ?? 0)
        ).catch(this.error);
        this.setCapabilityValue(
          'measure_temperature',
          Number(resultTemperature?.value ?? 0)
        ).catch(this.error);
        this.setCapabilityValue(
          'measure_pm1',
          Number(resultPM1?.value ?? 0)
        ).catch(this.error);
        this.setCapabilityValue(
          'measure_tvoc',
          Number(resulttVOC?.value ?? 0)
        ).catch(this.error);
        this.setCapabilityValue(
          'measure_pm25',
          Number(resultPM25?.value ?? 0)
        ).catch(this.error);
        this.setCapabilityValue(
          'measure_pm10',
          Number(resultPM10?.value ?? 0)
        ).catch(this.error);
        this.setCapabilityValue(
          'brightness2',
          Number(resultBrightness?.value ?? 0)
        ).catch(this.error);
        this.setCapabilityValue(
          'child_lock',
          resultChildLock?.value === 'true'
        ).catch(this.error);
        this.setCapabilityValue(
          'nightmode',
          resultNightMode?.value === 'true'
        ).catch(this.error);
        this.setCapabilityValue(
          'standby',
          resultStandby?.value === 'false' // Invert logic for standby
        ).catch(this.error);
        this.setCapabilityValue(
          'wifi_status',
          resultWiFiStatus?.value === 'true'
        ).catch(this.error);
        this.setCapabilityValue(
          'filter_status',
          this.calculateRemainingFilterLife(DeviceAttributes)
        ).catch(this.error);
        this.setCapabilityValue(
          'automode',
          resultAutoMode?.value === 'true'
        ).catch(this.error); // Update automode

        // Trigger fan speed change card if there's a change
        if (this.savedfanspeed?.value !== resultFanSpeed?.value) {
          const cardTriggerFilter = this.homey.flow.getTriggerCard(
            'fan-speed-has-changed'
          );
          cardTriggerFilter
            .trigger({
              'device-name': String(settings.name ?? 'Unknown Device'),
              'device-uuid': String(settings.uuid ?? 'Unknown UUID'),
              'fan speed': Number(resultFanSpeed?.value ?? 0),
            })
            .catch((err) =>
              this.error(
                'Failed to trigger fan-speed-has-changed flow card',
                err
              )
            );
          this.savedfanspeed = resultFanSpeed; // Update saved fan speed
        }

        // Trigger humidity change card if there's a change
        if (this.savedHumidity?.value !== resultHumidity?.value) {
          const cardTriggerFilter = this.homey.flow.getTriggerCard(
            'humidity-has-changed'
          );
          cardTriggerFilter
            .trigger({
              'device-name': String(settings.name ?? 'Unknown Device'),
              'device-uuid': String(settings.uuid ?? 'Unknown UUID'),
              'humidity new': Number(resultHumidity?.value ?? 0),
              'humidity old': Number(this.savedHumidity?.value ?? 0),
            })
            .catch((err) =>
              this.error(
                'Failed to trigger humidity-has-changed flow card',
                err
              )
            );
          this.savedHumidity = resultHumidity;
        }

        // Trigger temperature change card if there's a change
        if (this.savedTemperature?.value !== resultTemperature?.value) {
          const cardTriggerFilter = this.homey.flow.getTriggerCard(
            'temperature-has-changed'
          );
          cardTriggerFilter
            .trigger({
              'device-name': String(settings.name ?? 'Unknown Device'),
              'device-uuid': String(settings.uuid ?? 'Unknown UUID'),
              'temperature new': Number(resultTemperature?.value ?? 0),
              'temperature old': Number(this.savedTemperature?.value ?? 0),
            })
            .catch((err) =>
              this.error(
                'Failed to trigger temperature-has-changed flow card',
                err
              )
            );
          this.savedTemperature = resultTemperature;
        }

        // Trigger PM1 change card if there's a change
        if (this.savedPM1?.value !== resultPM1?.value) {
          const cardTriggerFilter =
            this.homey.flow.getTriggerCard('PM1-has-changed');
          cardTriggerFilter
            .trigger({
              'device-name': String(settings.name ?? 'Unknown Device'),
              'device-uuid': String(settings.uuid ?? 'Unknown UUID'),
              'PM1 new': Number(resultPM1?.value ?? 0),
              'PM1 old': Number(this.savedPM1?.value ?? 0),
            })
            .catch((err) =>
              this.error('Failed to trigger PM1-has-changed flow card', err)
            );
          this.savedPM1 = resultPM1;
        }

        // Trigger PM2.5 change card if there's a change
        if (this.savedPM25?.value !== resultPM25?.value) {
          const cardTriggerFilter =
            this.homey.flow.getTriggerCard('PM25-has-changed');
          cardTriggerFilter
            .trigger({
              'device-name': String(settings.name ?? 'Unknown Device'),
              'device-uuid': String(settings.uuid ?? 'Unknown UUID'),
              'PM25 new': Number(resultPM25?.value ?? 0),
              'PM25 old': Number(this.savedPM25?.value ?? 0),
            })
            .catch((err) =>
              this.error('Failed to trigger PM25-has-changed flow card', err)
            );
          this.savedPM25 = resultPM25;
        }

        // Trigger PM10 change card if there's a change
        if (this.savedPM10?.value !== resultPM10?.value) {
          const cardTriggerFilter =
            this.homey.flow.getTriggerCard('PM10-has-changed');
          cardTriggerFilter
            .trigger({
              'device-name': String(settings.name ?? 'Unknown Device'),
              'device-uuid': String(settings.uuid ?? 'Unknown UUID'),
              'PM10 new': Number(resultPM10?.value ?? 0),
              'PM10 old': Number(this.savedPM10?.value ?? 0),
            })
            .catch((err) =>
              this.error('Failed to trigger PM10-has-changed flow card', err)
            );
          this.savedPM10 = resultPM10;
        }

        // Trigger tVOC change card if there's a change
        if (this.savedtVOC?.value !== resulttVOC?.value) {
          const cardTriggerFilter =
            this.homey.flow.getTriggerCard('tVOC-has-changed');
          cardTriggerFilter
            .trigger({
              'device-name': String(settings.name ?? 'Unknown Device'),
              'device-uuid': String(settings.uuid ?? 'Unknown UUID'),
              'tVOC new': Number(resulttVOC?.value ?? 0),
              'tVOC old': Number(this.savedtVOC?.value ?? 0),
            })
            .catch((err) =>
              this.error('Failed to trigger tVOC-has-changed flow card', err)
            );
          this.savedtVOC = resulttVOC;
        }

        // Trigger filter status change card if there's a change
        const currentFilterStatus =
          this.calculateRemainingFilterLife(DeviceAttributes);
        if (this.savedFilterStatus !== currentFilterStatus) {
          const cardTriggerFilter = this.homey.flow.getTriggerCard(
            'filter-needs-change'
          );
          cardTriggerFilter
            .trigger({
              'device-name': String(settings.name ?? 'Unknown Device'),
              'device-uuid': String(settings.uuid ?? 'Unknown UUID'),
              'filter life remaining': String(currentFilterStatus ?? 'Unknown'),
            })
            .catch((err) =>
              this.error('Failed to trigger filter-needs-change flow card', err)
            );
          this.savedFilterStatus = currentFilterStatus;
        }
      }, settings.update * 1000);

      // Periodic check for filter status and trigger notification if needed
      this.intervalId2 = setInterval(async () => {
        const DeviceAttributes = await client.getDeviceStatus(
          data.accountuuid,
          [data.uuid]
        );

        // Update device settings for monitoring
        this.setSettings({
          uuid: DeviceAttributes[0].id,
          name: DeviceAttributes[0].name,
          model: DeviceAttributes[0].model,
          mac: DeviceAttributes[0].mac,
          serial: DeviceAttributes[0].serial,
          mcuFirmware: DeviceAttributes[0].mcu,
          wlanDriver: DeviceAttributes[0].wifi,
        });

        // Check filter usage status and trigger alert if it needs changing
        const resultFilterStatus =
          this.calculateRemainingFilterLife(DeviceAttributes);
        if (
          resultFilterStatus !== null &&
          resultFilterStatus !== undefined &&
          parseInt(resultFilterStatus, 10) <= 5 // Check if the remaining filter life is 5% or less
        ) {
          const cardTriggerFilter = this.homey.flow.getTriggerCard(
            'filter-needs-change'
          );
          cardTriggerFilter
            .trigger({
              'device-name': String(settings.name ?? 'Unknown Device'),
              'device-uuid': String(settings.uuid ?? 'Unknown UUID'),
              'device-response': String(resultFilterStatus ?? 'Unknown'),
            })
            .catch((err) =>
              this.error('Failed to trigger filter-needs-change flow card', err)
            );
        }
      }, 60000);

      // Register action card listeners for controlling brightness
      const brightnesscard = this.homey.flow.getActionCard('set-brightness2');
      brightnesscard.registerRunListener(async (value) => {
        this.log(
          'Want to change the brightness with value: ',
          value.brightness
        );
        await client.setBrightness(data.uuid, value.brightness);
        this.log('Changed brightness to:', value.brightness);
      });

      // Register action card listeners for controlling fan speed
      const fancard = this.homey.flow.getActionCard('set-fan-speed2');
      fancard.registerRunListener(async (value) => {
        this.log('Want to change the fan speed with value: ', value.fanspeed);
        await client.setFanSpeed(data.uuid, value.fanspeed);
        this.log('Changed fan speed:', value.fanspeed);
      });

      // Register action card listeners for controlling automatic
      const autocard = this.homey.flow.getActionCard('set-automatic2');
      autocard.registerRunListener(async (value) => {
        this.log('Want to change the automatic with value: ', value.automatic);
        await client.setFanAuto(data.uuid, value.automatic);
        this.log('Changed automatic:', value.automatic);
      });

      // Register action card listeners for controlling night mode
      const nightmodecard = this.homey.flow.getActionCard('set-nightmode2');
      nightmodecard.registerRunListener(async (value) => {
        this.log('Want to change the night mode with value: ', value.nightmode);
        await client.setNightMode(data.uuid, value.nightmode);
        this.log('Changed night mode:', value.nightmode);
      });

      // Register action card listeners for controlling standby
      const standbycard = this.homey.flow.getActionCard('set-standby2');
      standbycard.registerRunListener(async (value) => {
        this.log('Want to change the standby with value: ', value.standby);
        await client.setStandby(data.uuid, value.standby);
        this.log('Changed standby:', value.standby);
      });

      // Register action card listeners for controlling child lock
      const childlockcard = this.homey.flow.getActionCard('set-childlock2');
      childlockcard.registerRunListener(async (value) => {
        this.log('Want to change the child lock with value: ', value.childlock);
        await client.setChildLock(data.uuid, value.childlock);
        this.log('Changed child lock:', value.childlock);
      });

      // Register condition card listeners for PM and tVOC score conditions
      this.homey.flow
        .getConditionCard('score_pm25')
        .registerRunListener(async (args, state) => {
          const result =
            conditionScorePm25ToString(
              this.getCapabilityValue('measure_pm25')
            ) === args.argument_main;
          return Promise.resolve(result);
        });
      this.homey.flow
        .getConditionCard('score_pm1')
        .registerRunListener(async (args, state) => {
          const result =
            conditionScorePm1ToString(
              this.getCapabilityValue('measure_pm1')
            ) === args.argument_main;
          return Promise.resolve(result);
        });
      this.homey.flow
        .getConditionCard('score_pm10')
        .registerRunListener(async (args, state) => {
          const result =
            conditionScorePm10ToString(
              this.getCapabilityValue('measure_pm10')
            ) === args.argument_main;
          return Promise.resolve(result);
        });
      this.homey.flow
        .getConditionCard('score_tVOC')
        .registerRunListener(async (args, state) => {
          const result =
            conditionScoretVOCToString(
              this.getCapabilityValue('measure_tvoc')
            ) === args.argument_main;
          return Promise.resolve(result);
        });

      this.log('BlueAirHealthProtectDevice has been initialized');
    } catch (e) {
      this.error('Error during initialization:', e); // Log any initialization errors
    }
  }

  /**
   * Calculate the remaining filter life based on the filter usage percentage.
   * @param devices - An array of BlueAirDeviceStatus objects.
   * @returns The percentage of filter life remaining as a string with a % character.
   */
  private calculateRemainingFilterLife(
    devices: BlueAirDeviceStatus[]
  ): string | null {
    const filterUsage = filterSettings(devices, 'filterusage'); // Fetch filter usage setting
    if (filterUsage && filterUsage.value) {
      const usedPercentage = Number(filterUsage.value); // Convert the filter usage value to a number
      const remainingPercentage = 100 - usedPercentage; // Calculate the remaining percentage
      return `${remainingPercentage} %`; // Return the remaining filter life percentage with % character
    }
    return null; // Return null if the filter usage information is not available
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded(): Promise<void> {
    this.log('BlueAirHealthProtectDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * This method handles any necessary changes when settings are updated.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
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
    this.log('BlueAirHealthProtectDevice settings were changed');
    this.log('Old Settings:', oldSettings); // Log the old settings for debugging
    this.log('New Settings:', newSettings); // Log the new settings for debugging
    this.log('Changed Keys:', changedKeys); // Log the keys that were changed
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used to synchronize the name to the device.
   * @param name The new name
   */
  async onRenamed(name: string): Promise<void> {
    this.log('BlueAirHealthProtectDevice was renamed to:', name);
  }

  /**
   * onDeleted is called when the user deletes the device.
   * This method ensures that any active intervals are cleared to prevent continued operations.
   */
  async onDeleted(): Promise<void> {
    this.log('BlueAirHealthProtectDevice has been deleted');

    // Clear the first interval if it's active
    if (this.intervalId1) {
      clearInterval(this.intervalId1); // Clear the first interval
      this.log('Interval 1 cleared'); // Log clearing of the first interval
      this.intervalId1 = null; // Reset the interval ID
    }

    // Clear the second interval if it's active
    if (this.intervalId2) {
      clearInterval(this.intervalId2); // Clear the second interval
      this.log('Interval 2 cleared'); // Log clearing of the second interval
      this.intervalId2 = null; // Reset the interval ID
    }

    // Additional cleanup if necessary
    this.savedfanspeed = null; // Reset saved fan speed
  }
}

module.exports = BlueAirHealthProtectDevice;
