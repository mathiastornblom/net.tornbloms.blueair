import BlueAirAwsFullDevice from '../BlueAirAwsFullDevice';

class BlueAirHealthProtectDevice extends BlueAirAwsFullDevice {
  protected readonly deviceCapabilities = [
    'automode',
    'brightness2',
    'child_lock',
    'fanspeed',
    'filter_status',
    'germ_shield',
    'measure_co2',
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
    this.log('BlueAirHealthProtectDevice has been added');
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
    this.log('BlueAirHealthProtectDevice settings were changed');
    this.log('Changed keys:', changedKeys);
  }

  async onRenamed(name: string): Promise<void> {
    this.log('BlueAirHealthProtectDevice was renamed to:', name);
  }

  async onDeleted(): Promise<void> {
    this.log('BlueAirHealthProtectDevice has been deleted');
    await super.onDeleted();
  }
}

module.exports = BlueAirHealthProtectDevice;
