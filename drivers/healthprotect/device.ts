import BlueAirAwsFullDevice from '../BlueAirAwsFullDevice';

class BlueAirHealthProtectDevice extends BlueAirAwsFullDevice {
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
