import { BlueAirAwsClient } from 'blueairaws-client';
import { BlueAirDeviceStatus } from 'blueairaws-client/dist/Consts';
import BlueAirAwsBaseDevice from '../BlueAirAwsBaseDevice';
import {
  filterSettings,
  calculateRemainingFilterLife,
  calculateFilterLifePercent,
  DeviceSetting,
  conditionScorePm25ToString,
} from '../BlueAirAwsUtils';

class BlueAirPureDevice extends BlueAirAwsBaseDevice {
  protected readonly deviceCapabilities = [
    'automode',
    'brightness2',
    'child_lock',
    'fanspeed',
    'filter_status',
    'measure_filter_life',
    'measure_pm25',
    'nightmode',
    'standby',
    'wifi_status',
  ];

  // Saved values for flow-card change detection
  private savedFanspeed: DeviceSetting | null = null;
  private savedPM25: DeviceSetting | null = null;
  private savedFilterStatus: string | null = null;
  private savedWifiStatus: boolean | null = null;

  // ── applyStatus ───────────────────────────────────────────────────────────

  protected applyStatus(
    attrs: BlueAirDeviceStatus[],
    settings: Record<string, any>
  ): void {
    const fanspeed   = filterSettings(attrs, 'fanspeed');
    const pm25       = filterSettings(attrs, 'pm2_5');
    const brightness = filterSettings(attrs, 'brightness');
    const childlock  = filterSettings(attrs, 'childlock');
    const nightmode  = filterSettings(attrs, 'nightmode');
    const standby    = filterSettings(attrs, 'standby');
    const online     = filterSettings(attrs, 'online');
    const automode   = filterSettings(attrs, 'automode');
    const filterLife        = calculateRemainingFilterLife(attrs);
    const filterLifePercent = calculateFilterLifePercent(attrs);

    this.setCapabilityValue('fanspeed',      Number(fanspeed?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('measure_pm25',  Number(pm25?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('brightness2',   Number(brightness?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('child_lock',    childlock?.value === 'true').catch(this.error);
    this.setCapabilityValue('nightmode',     nightmode?.value === 'true').catch(this.error);
    this.setCapabilityValue('standby',       standby?.value === 'false').catch(this.error);
    this.setCapabilityValue('wifi_status',   online?.value === 'true').catch(this.error);
    this.setCapabilityValue('filter_status',        filterLife).catch(this.error);
    if (filterLifePercent != null) {
      this.setCapabilityValue('measure_filter_life', filterLifePercent).catch(this.error);
    }
    this.setCapabilityValue('automode',      automode?.value === 'true').catch(this.error);

    // Only trigger flow cards after initial load
    if (this.isInitialized) {
      const name = String(settings.name ?? 'Unknown Device');
      const uuid = String(settings.uuid ?? 'Unknown UUID');

      if (this.savedFanspeed?.value !== fanspeed?.value) {
        this.homey.flow.getTriggerCard('fan-speed-has-changed')
          .trigger({ 'device-name': name, 'device-uuid': uuid, 'fan speed': Number(fanspeed?.value ?? 0) })
          .catch((e) => this.error('Failed to trigger fan-speed-has-changed', e));
      }

      if (this.savedPM25?.value !== pm25?.value) {
        this.homey.flow.getTriggerCard('PM25-has-changed')
          .trigger({ 'device-name': name, 'device-uuid': uuid, 'PM25 new': Number(pm25?.value ?? 0), 'PM25 old': Number(this.savedPM25?.value ?? 0) })
          .catch((e) => this.error('Failed to trigger PM25-has-changed', e));
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
    this.savedPM25        = pm25;
    this.savedWifiStatus  = online?.value === 'true';
    this.savedFilterStatus = filterLife;
  }

  // ── setupListeners ────────────────────────────────────────────────────────

  protected setupListeners(
    client: BlueAirAwsClient,
    data: Record<string, any>,
    _settings: Record<string, any>
  ): void {
    // Capability listeners — revert value if API call fails
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

    // Action cards — use args.device so the correct device is always targeted,
    // regardless of which device instance last called setupListeners.
    this.homey.flow.getActionCard('set-brightness2').registerRunListener(async (args) => {
      await (args.device as BlueAirPureDevice).performSetBrightness(args.brightness);
    });

    this.homey.flow.getActionCard('set-fan-speed2').registerRunListener(async (args) => {
      await (args.device as BlueAirPureDevice).performSetFanSpeed(args.fanspeed);
    });

    this.homey.flow.getActionCard('set-automatic2').registerRunListener(async (args) => {
      await (args.device as BlueAirPureDevice).performSetAutomatic(args.automatic === 'true');
    });

    this.homey.flow.getActionCard('set-nightmode2').registerRunListener(async (args) => {
      await (args.device as BlueAirPureDevice).performSetNightMode(args.nightmode === 'true');
    });

    this.homey.flow.getActionCard('set-standby2').registerRunListener(async (args) => {
      await (args.device as BlueAirPureDevice).performSetStandby(args.standby === 'true');
    });

    this.homey.flow.getActionCard('set-childlock2').registerRunListener(async (args) => {
      await (args.device as BlueAirPureDevice).performSetChildLock(args.childlock === 'true');
    });

    this.homey.flow.getActionCard('turn-on2').registerRunListener(async (args) => {
      await (args.device as BlueAirPureDevice).performTurnOn();
    });

    this.homey.flow.getActionCard('turn-off2').registerRunListener(async (args) => {
      await (args.device as BlueAirPureDevice).performTurnOff();
    });

    this.homey.flow.getActionCard('set-auto-mode2').registerRunListener(async (args) => {
      await (args.device as BlueAirPureDevice).performSetAutoMode();
    });

    // Condition card
    this.homey.flow.getConditionCard('score_pm25').registerRunListener(async (args) =>
      conditionScorePm25ToString(this.getCapabilityValue('measure_pm25')) === args.argument_main
    );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async onAdded(): Promise<void> {
    this.logger.info('BlueAirPureDevice has been added');
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
    this.logger.info('BlueAirPureDevice settings were changed');
    this.logger.info('Changed keys:', changedKeys);
  }

  async onRenamed(name: string): Promise<void> {
    this.logger.info('BlueAirPureDevice was renamed to:', name);
  }

  async onDeleted(): Promise<void> {
    this.logger.info('BlueAirPureDevice has been deleted');
    await super.onDeleted();
  }
}

module.exports = BlueAirPureDevice;
