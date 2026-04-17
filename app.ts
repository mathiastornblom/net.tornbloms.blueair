import Homey from 'homey';
import { initSentryLog, setVerboseLogging } from './lib/diagnostics';

const { Log } = require('homey-log');

class BlueAirApp extends Homey.App {
  homeyLog: any;

  async onInit(): Promise<void> {
    this.homeyLog = new Log({ homey: this.homey });
    initSentryLog(this.homeyLog);

    const verbose = this.homey.settings.get('verboseLogging') ?? false;
    setVerboseLogging(verbose);

    this.homey.settings.on('set', (key: string) => {
      if (key === 'verboseLogging') {
        setVerboseLogging(this.homey.settings.get('verboseLogging') ?? false);
      }
    });

    this.log('BlueAir has been initialized');
  }
}

module.exports = BlueAirApp;
