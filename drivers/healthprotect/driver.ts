import BlueAirAwsBaseDriver from '../BlueAirAwsBaseDriver';

class BlueAirHealthProtectDriver extends BlueAirAwsBaseDriver {
  protected deviceModelFilters = ['healthprotect'];

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit(): Promise<void> {
    this.log('BlueAir HealthProtect Driver has been initialized');
    await super.onInit(); // Call the base class's onInit method
  }
}

module.exports = BlueAirHealthProtectDriver;
