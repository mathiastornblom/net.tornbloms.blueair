import BlueAirAwsBaseDriver from '../BlueAirAwsBaseDriver';

class BlueAirPureDriver extends BlueAirAwsBaseDriver {
  protected deviceModelFilters = ['version:blue'];

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit(): Promise<void> {
    this.log('BlueAir Pure Driver has been initialized');
    await super.onInit(); // Call the base class's onInit method
  }
}

module.exports = BlueAirPureDriver;
