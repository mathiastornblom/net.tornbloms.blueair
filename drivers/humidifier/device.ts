import { BlueAirAwsClient } from 'blueairaws-client';
import { BlueAirDeviceStatus } from 'blueairaws-client/dist/Consts';
import BlueAirAwsBaseDevice from '../BlueAirAwsBaseDevice';
import {
  filterSettings,
  calculateRemainingFilterLife,
  calculateFilterLifePercent,
  DeviceSetting,
} from '../BlueAirAwsUtils';

class BlueAirHumidifierDevice extends BlueAirAwsBaseDevice {
  protected readonly deviceCapabilities = [
    'automode',
    'brightness2',
    'child_lock',
    'fanspeed',
    'filter_status',
    'measure_filter_life',
    'measure_humidity',
    'measure_temperature',
    'nightmode',
    'standby',
    'wifi_status',
  ];

  // Saved values for flow-card change detection
  private savedFanspeed: DeviceSetting | null = null;
  private savedHumidity: DeviceSetting | null = null;
  private savedTemperature: DeviceSetting | null = null;
  private savedFilterStatus: string | null = null;
  private savedWifiStatus: boolean | null = null;

  // ── applyStatus ───────────────────────────────────────────────────────────

  protected applyStatus(
    attrs: BlueAirDeviceStatus[],
    settings: Record<string, any>
  ): void {
    const fanspeed     = filterSettings(attrs, 'fanspeed');
    const humidity     = filterSettings(attrs, 'humidity');
    const temperature  = filterSettings(attrs, 'temperature');
    const brightness   = filterSettings(attrs, 'brightness');
    const childlock    = filterSettings(attrs, 'childlock');
    const nightmode    = filterSettings(attrs, 'nightmode');
    const standby      = filterSettings(attrs, 'standby');
    const online       = filterSettings(attrs, 'online');
    const automode     = filterSettings(attrs, 'automode');
    const filterLife        = calculateRemainingFilterLife(attrs);
    const filterLifePercent = calculateFilterLifePercent(attrs);

    this.setCapabilityValue('fanspeed',            Number(fanspeed?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('measure_humidity',     Number(humidity?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('measure_temperature',  Number(temperature?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('brightness2',          Number(brightness?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('child_lock',           childlock?.value === 'true').catch(this.error);
    this.setCapabilityValue('nightmode',            nightmode?.value === 'true').catch(this.error);
    this.setCapabilityValue('standby',              standby?.value === 'false').catch(this.error);
    this.setCapabilityValue('wifi_status',          online?.value === 'true').catch(this.error);
    this.setCapabilityValue('filter_status',        filterLife).catch(this.error);
    if (filterLifePercent != null) {
      this.setCapabilityValue('measure_filter_life', filterLifePercent).catch(this.error);
    }
    this.setCapabilityValue('automode', automode?.value === 'true').catch(this.error);

    if (this.isInitialized) {
      const name = String(settings.name ?? 'Unknown Device');
      const uuid = String(settings.uuid ?? 'Unknown UUID');

      if (this.savedFanspeed?.value !== fanspeed?.value) {
        this.homey.flow.getTriggerCard('fan-speed-has-changed')
          .trigger({ 'device-name': name, 'device-uuid': uuid, 'fan speed': Number(fanspeed?.value ?? 0) })
          .catch((e) => this.error('Failed to trigger fan-speed-has-changed', e));
      }

      if (this.savedHumidity?.value !== humidity?.value) {
        this.homey.flow.getTriggerCard('humidity-has-changed')
          .trigger({ 'device-name': name, 'device-uuid': uuid, 'humidity new': Number(humidity?.value ?? 0), 'humidity old': Number(this.savedHumidity?.value ?? 0) })
          .catch((e) => this.error('Failed to trigger humidity-has-changed', e));
      }

      if (this.savedTemperature?.value !== temperature?.value) {
        this.homey.flow.getTriggerCard('temperature-has-changed')
          .trigger({ 'device-name': name, 'device-uuid': uuid, 'temperature new': Number(temperature?.value ?? 0), 'temperature old': Number(this.savedTemperature?.value ?? 0) })
          .catch((e) => this.error('Failed to trigger temperature-has-changed', e));
      }

      if (this.savedFilterStatus !== filterLife) {
        this.homey.flow.getTriggerCard('filter-needs-change')
          .trigger({ 'device-name': name, 'device-uuid': uuid, 'device-response': String(filterLife ?? 'Unknown') })
          .catch((e) => this.error('Failed to trigger filter-needs-change', e));
      }

      const isOnline = online?.value === 'true';
      if (this.savedWifiStatus !== null && this.savedWifiStatus !== isOnline) {
        this.homey.flow.getTriggerCard('wifi-status-changed')
          .trigger({ 'device-name': name, 'device-uuid': uuid, 'online': isOnline })
          .catch((e) => this.error('Failed to trigger wifi-status-changed', e));
      }
    }

    this.savedFanspeed    = fanspeed;
    this.savedHumidity    = humidity;
    this.savedTemperature = temperature;
    this.savedWifiStatus  = online?.value === 'true';
    this.savedFilterStatus = filterLife;
  }

  // ── setupListeners ────────────────────────────────────────────────────────

  protected setupListeners(
    client: BlueAirAwsClient,
    data: Record<string, any>,
    _settings: Record<string, any>
  ): void {
    this.registerCapabilityListener('fanspeed', async (value) => {
      await this.safeSetCommand('fanspeed', () => client.setFanSpeed(data.uuid, value));
    });

    this.registerCapabilityListener('automode', async (value) => {
      await this.safeSetCommand('automode', () => client.setFanAuto(data.uuid, value));
    });

    this.registerCapabilityListener('brightness2', async (value) => {
      await this.safeSetCommand('brightness2', () => client.setBrightness(data.uuid, value));
    });

    this.registerCapabilityListener('child_lock', async (value) => {
      await this.safeSetCommand('child_lock', () => client.setChildLock(data.uuid, value));
    });

    this.registerCapabilityListener('nightmode', async (value) => {
      await this.safeSetCommand('nightmode', () => client.setNightMode(data.uuid, value));
    });

    this.registerCapabilityListener('standby', async (value) => {
      await this.safeSetCommand('standby', () => client.setStandby(data.uuid, !value));
    });

    this.homey.flow.getActionCard('set-brightness2').registerRunListener(async (args) => {
      await (args.device as BlueAirHumidifierDevice).performSetBrightness(args.brightness);
    });

    this.homey.flow.getActionCard('set-fan-speed2').registerRunListener(async (args) => {
      await (args.device as BlueAirHumidifierDevice).performSetFanSpeed(args.fanspeed);
    });

    this.homey.flow.getActionCard('set-automatic2').registerRunListener(async (args) => {
      await (args.device as BlueAirHumidifierDevice).performSetAutomatic(args.automatic === 'true');
    });

    this.homey.flow.getActionCard('set-nightmode2').registerRunListener(async (args) => {
      await (args.device as BlueAirHumidifierDevice).performSetNightMode(args.nightmode === 'true');
    });

    this.homey.flow.getActionCard('set-standby2').registerRunListener(async (args) => {
      await (args.device as BlueAirHumidifierDevice).performSetStandby(args.standby === 'true');
    });

    this.homey.flow.getActionCard('set-childlock2').registerRunListener(async (args) => {
      await (args.device as BlueAirHumidifierDevice).performSetChildLock(args.childlock === 'true');
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async onAdded(): Promise<void> {
    this.logger.info('BlueAirHumidifierDevice has been added');
  }

  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.logger.info('BlueAirHumidifierDevice settings were changed');
    this.logger.info('Changed keys:', changedKeys);
  }

  async onRenamed(name: string): Promise<void> {
    this.logger.info('BlueAirHumidifierDevice was renamed to:', name);
  }

  async onDeleted(): Promise<void> {
    this.logger.info('BlueAirHumidifierDevice has been deleted');
    await super.onDeleted();
  }
}

module.exports = BlueAirHumidifierDevice;
