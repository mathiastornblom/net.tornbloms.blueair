import BlueAirAwsBaseDriver from '../BlueAirAwsBaseDriver';
import { BlueAirAwsClient } from 'blueairaws-client';
import { Region } from 'blueairaws-client/dist/Consts';

const HUMIDIFIER_MODELS = ['h35i', 'h76i', 't10i', 't20i'];

class BlueAirHumidifierDriver extends BlueAirAwsBaseDriver {
  protected deviceModelFilter = 'humidifier';

  protected async filterCompatibleDevices(
    devicesList: any[],
    client: BlueAirAwsClient,
    username: string,
    password: string
  ) {
    const accountuuid = devicesList[0].name;
    const compatible = [];

    for (const device of devicesList) {
      const statusArray = await client.getDeviceStatus(accountuuid, [device.uuid]);
      for (const info of statusArray) {
        if (HUMIDIFIER_MODELS.some(m => info.model.toLowerCase().includes(m))) {
          compatible.push({
            name: info.name,
            data: { accountuuid, uuid: info.id, mac: device.mac },
            store: { name: info.name },
            settings: { username, password, region: Region.EU },
          });
        }
      }
    }
    return compatible;
  }

  async onInit(): Promise<void> {
    this.log('BlueAir Humidifier Driver has been initialized');
    await super.onInit();
  }
}

module.exports = BlueAirHumidifierDriver;
