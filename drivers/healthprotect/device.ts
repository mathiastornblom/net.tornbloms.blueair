import BlueAirAwsFullDevice from '../BlueAirAwsFullDevice';

class BlueAirHealthProtectDevice extends BlueAirAwsFullDevice {
  // measure_co2, measure_hcho, germ_shield, mood_light are optional —
  // added dynamically by discoverOptionalCapabilities based on API response.
  protected readonly deviceCapabilities = [
    'automode',
    'brightness2',
    'child_lock',
    'fanspeed',
    'filter_status',
    'measure_filter_life',
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
  async onAdded(): Promise<void> {
    this.logger.info('BlueAirHealthProtectDevice has been added');
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
    this.logger.info('BlueAirHealthProtectDevice settings were changed');
    this.logger.info('Changed keys:', changedKeys);
  }

  async onRenamed(name: string): Promise<void> {
    this.logger.info('BlueAirHealthProtectDevice was renamed to:', name);
  }

  async onDeleted(): Promise<void> {
    this.logger.info('BlueAirHealthProtectDevice has been deleted');
    await super.onDeleted();
  }
}

module.exports = BlueAirHealthProtectDevice;
