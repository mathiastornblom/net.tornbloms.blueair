import Homey from 'homey';
import { initSentryLog } from './lib/diagnostics';

const { Log } = require('homey-log');

class BlueAirApp extends Homey.App {
  homeyLog: any;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit(): Promise<void> {
    this.homeyLog = new Log({ homey: this.homey });
    initSentryLog(this.homeyLog);
    this.log('BlueAir has been initialized');
  }
}

module.exports = BlueAirApp;
