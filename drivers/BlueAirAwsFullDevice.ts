import { BlueAirAwsClient } from 'blueairaws-client';
import { BlueAirDeviceStatus } from 'blueairaws-client/dist/Consts';
import BlueAirAwsBaseDevice from './BlueAirAwsBaseDevice';
import {
  filterSettings,
  calculateRemainingFilterLife,
  DeviceSetting,
  conditionScorePm25ToString,
  conditionScorePm1ToString,
  conditionScorePm10ToString,
  conditionScoretVOCToString,
} from './BlueAirAwsUtils';

/**
 * Shared device implementation for full-featured BlueAir AWS devices
 * (HealthProtect and DustMagnet).
 *
 * Capabilities: fanspeed, automode, brightness, child_lock, nightmode,
 * standby, wifi_status, filter_status, PM1/2.5/10, tvoc, humidity, temperature.
 */
abstract class BlueAirAwsFullDevice extends BlueAirAwsBaseDevice {
  protected readonly deviceCapabilities = [
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

  // Saved values for flow-card change detection
  private savedFanspeed: DeviceSetting | null = null;
  private savedHumidity: DeviceSetting | null = null;
  private savedTemperature: DeviceSetting | null = null;
  private savedPM1: DeviceSetting | null = null;
  private savedPM25: DeviceSetting | null = null;
  private savedPM10: DeviceSetting | null = null;
  private savedtVOC: DeviceSetting | null = null;
  private savedFilterStatus: string | null = null;
  private savedCo2: DeviceSetting | null = null;

  // ── applyStatus ───────────────────────────────────────────────────────────

  protected applyStatus(
    attrs: BlueAirDeviceStatus[],
    settings: Record<string, any>
  ): void {
    const fanspeed    = filterSettings(attrs, 'fanspeed');
    const humidity    = filterSettings(attrs, 'humidity');
    const temperature = filterSettings(attrs, 'temperature');
    const pm1         = filterSettings(attrs, 'pm1');
    const pm25        = filterSettings(attrs, 'pm2_5');
    const pm10        = filterSettings(attrs, 'pm10');
    const tvoc        = filterSettings(attrs, 'tvoc');
    const brightness  = filterSettings(attrs, 'brightness');
    const childlock   = filterSettings(attrs, 'childlock');
    const nightmode   = filterSettings(attrs, 'nightmode');
    const standby     = filterSettings(attrs, 'standby');
    const online      = filterSettings(attrs, 'online');
    const automode    = filterSettings(attrs, 'automode');
    const germshield  = filterSettings(attrs, 'germshield');
    const co2         = filterSettings(attrs, 'co2');
    const filterLife  = calculateRemainingFilterLife(attrs);

    this.setCapabilityValue('fanspeed',           Number(fanspeed?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('measure_humidity',    Number(humidity?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('measure_temperature', Number(temperature?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('measure_pm1',         Number(pm1?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('measure_pm25',        Number(pm25?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('measure_pm10',        Number(pm10?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('measure_tvoc',        Number(tvoc?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('brightness2',         Number(brightness?.value ?? 0)).catch(this.error);
    this.setCapabilityValue('child_lock',          childlock?.value === 'true').catch(this.error);
    this.setCapabilityValue('nightmode',           nightmode?.value === 'true').catch(this.error);
    this.setCapabilityValue('standby',             standby?.value === 'false').catch(this.error);
    this.setCapabilityValue('wifi_status',         online?.value === 'true').catch(this.error);
    this.setCapabilityValue('filter_status',       filterLife).catch(this.error);
    this.setCapabilityValue('automode',            automode?.value === 'true').catch(this.error);
    if (this.hasCapability('germ_shield')) {
      this.setCapabilityValue('germ_shield',       germshield?.value === 'true').catch(this.error);
    }
    if (this.hasCapability('measure_co2')) {
      this.setCapabilityValue('measure_co2',       Number(co2?.value ?? 0)).catch(this.error);
    }

    // Only trigger flow cards after initial load
    if (this.isInitialized) {
      this.triggerFlowCards(settings, {
        fanspeed, humidity, temperature, pm1, pm25, pm10, tvoc, co2, filterLife,
      });
    }

    // Update saved state
    this.savedFanspeed    = fanspeed;
    this.savedHumidity    = humidity;
    this.savedTemperature = temperature;
    this.savedPM1         = pm1;
    this.savedPM25        = pm25;
    this.savedPM10        = pm10;
    this.savedtVOC        = tvoc;
    this.savedCo2         = co2;
    this.savedFilterStatus = filterLife;
  }

  // ── Flow card triggers ────────────────────────────────────────────────────

  private triggerFlowCards(
    settings: Record<string, any>,
    current: {
      fanspeed:    DeviceSetting | null;
      humidity:    DeviceSetting | null;
      temperature: DeviceSetting | null;
      pm1:         DeviceSetting | null;
      pm25:        DeviceSetting | null;
      pm10:        DeviceSetting | null;
      tvoc:        DeviceSetting | null;
      co2:         DeviceSetting | null;
      filterLife:  string | null;
    }
  ): void {
    const name = String(settings.name ?? 'Unknown Device');
    const uuid = String(settings.uuid ?? 'Unknown UUID');

    if (this.savedFanspeed?.value !== current.fanspeed?.value) {
      this.homey.flow.getTriggerCard('fan-speed-has-changed')
        .trigger({ 'device-name': name, 'device-uuid': uuid, 'fan speed': Number(current.fanspeed?.value ?? 0) })
        .catch((e) => this.error('Failed to trigger fan-speed-has-changed', e));
    }

    if (this.savedHumidity?.value !== current.humidity?.value) {
      this.homey.flow.getTriggerCard('humidity-has-changed')
        .trigger({ 'device-name': name, 'device-uuid': uuid, 'humidity new': Number(current.humidity?.value ?? 0), 'humidity old': Number(this.savedHumidity?.value ?? 0) })
        .catch((e) => this.error('Failed to trigger humidity-has-changed', e));
    }

    if (this.savedTemperature?.value !== current.temperature?.value) {
      this.homey.flow.getTriggerCard('temperature-has-changed')
        .trigger({ 'device-name': name, 'device-uuid': uuid, 'temperature new': Number(current.temperature?.value ?? 0), 'temperature old': Number(this.savedTemperature?.value ?? 0) })
        .catch((e) => this.error('Failed to trigger temperature-has-changed', e));
    }

    if (this.savedPM1?.value !== current.pm1?.value) {
      this.homey.flow.getTriggerCard('PM1-has-changed')
        .trigger({ 'device-name': name, 'device-uuid': uuid, 'PM1 new': Number(current.pm1?.value ?? 0), 'PM1 old': Number(this.savedPM1?.value ?? 0) })
        .catch((e) => this.error('Failed to trigger PM1-has-changed', e));
    }

    if (this.savedPM25?.value !== current.pm25?.value) {
      this.homey.flow.getTriggerCard('PM25-has-changed')
        .trigger({ 'device-name': name, 'device-uuid': uuid, 'PM25 new': Number(current.pm25?.value ?? 0), 'PM25 old': Number(this.savedPM25?.value ?? 0) })
        .catch((e) => this.error('Failed to trigger PM25-has-changed', e));
    }

    if (this.savedPM10?.value !== current.pm10?.value) {
      this.homey.flow.getTriggerCard('PM10-has-changed')
        .trigger({ 'device-name': name, 'device-uuid': uuid, 'PM10 new': Number(current.pm10?.value ?? 0), 'PM10 old': Number(this.savedPM10?.value ?? 0) })
        .catch((e) => this.error('Failed to trigger PM10-has-changed', e));
    }

    if (this.savedtVOC?.value !== current.tvoc?.value) {
      this.homey.flow.getTriggerCard('tVOC-has-changed')
        .trigger({ 'device-name': name, 'device-uuid': uuid, 'tVOC new': Number(current.tvoc?.value ?? 0), 'tVOC old': Number(this.savedtVOC?.value ?? 0) })
        .catch((e) => this.error('Failed to trigger tVOC-has-changed', e));
    }

    if (this.hasCapability('measure_co2') && this.savedCo2?.value !== current.co2?.value) {
      this.homey.flow.getTriggerCard('CO2-has-changed')
        .trigger({ 'device-name': name, 'device-uuid': uuid, 'co2': Number(current.co2?.value ?? 0) })
        .catch((e) => this.error('Failed to trigger CO2-has-changed', e));
    }

    if (this.savedFilterStatus !== current.filterLife) {
      this.homey.flow.getTriggerCard('filter-needs-change')
        .trigger({ 'device-name': name, 'device-uuid': uuid, 'device-response': String(current.filterLife ?? 'Unknown') })
        .catch((e) => this.error('Failed to trigger filter-needs-change', e));
    }
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
      // standby capability is true = "on" but device expects inverted value
      await this.safeSetCommand('standby', () => client.setStandby(data.uuid, !value));
    });

    // Action cards — use args.device so the correct device is always targeted,
    // regardless of which device instance last called setupListeners.
    this.homey.flow.getActionCard('set-brightness2').registerRunListener(async (args) => {
      await (args.device as BlueAirAwsBaseDevice).performSetBrightness(args.brightness);
    });

    this.homey.flow.getActionCard('set-fan-speed2').registerRunListener(async (args) => {
      await (args.device as BlueAirAwsBaseDevice).performSetFanSpeed(args.fanspeed);
    });

    this.homey.flow.getActionCard('set-automatic2').registerRunListener(async (args) => {
      await (args.device as BlueAirAwsBaseDevice).performSetAutomatic(args.automatic === 'true');
    });

    this.homey.flow.getActionCard('set-nightmode2').registerRunListener(async (args) => {
      await (args.device as BlueAirAwsBaseDevice).performSetNightMode(args.nightmode === 'true');
    });

    this.homey.flow.getActionCard('set-standby2').registerRunListener(async (args) => {
      await (args.device as BlueAirAwsBaseDevice).performSetStandby(args.standby === 'true');
    });

    this.homey.flow.getActionCard('set-childlock2').registerRunListener(async (args) => {
      await (args.device as BlueAirAwsBaseDevice).performSetChildLock(args.childlock === 'true');
    });

    if (this.hasCapability('germ_shield')) {
      this.registerCapabilityListener('germ_shield', async (value) => {
        await this.safeSetCommand('germ_shield', () =>
          this.performSetGermShield(value)
        );
      });

      this.homey.flow.getActionCard('set-germshield2').registerRunListener(async (args) => {
        await (args.device as BlueAirAwsBaseDevice).performSetGermShield(args.germshield === 'true');
      });
    }

    // Condition cards
    this.homey.flow.getConditionCard('score_pm25').registerRunListener(async (args) =>
      conditionScorePm25ToString(this.getCapabilityValue('measure_pm25')) === args.argument_main
    );

    this.homey.flow.getConditionCard('score_pm1').registerRunListener(async (args) =>
      conditionScorePm1ToString(this.getCapabilityValue('measure_pm1')) === args.argument_main
    );

    this.homey.flow.getConditionCard('score_pm10').registerRunListener(async (args) =>
      conditionScorePm10ToString(this.getCapabilityValue('measure_pm10')) === args.argument_main
    );

    this.homey.flow.getConditionCard('score_tVOC').registerRunListener(async (args) =>
      conditionScoretVOCToString(this.getCapabilityValue('measure_tvoc')) === args.argument_main
    );
  }
}

export default BlueAirAwsFullDevice;
