import { Driver } from 'homey';
import { BlueAirAwsClient } from 'blueairaws-client';
import { Region } from 'blueairaws-client/dist/Consts';

abstract class BlueAirAwsBaseDriver extends Driver {
  protected abstract deviceModelFilter: string;

  // Shared client per credential set — avoids parallel Gigya logins at startup
  private _clientPromises: Map<string, Promise<BlueAirAwsClient>> = new Map();

  /**
   * Returns a shared, initialized BlueAirAwsClient for the given credentials.
   * Multiple devices calling this simultaneously will all await the same Promise,
   * so only one Gigya authentication is performed.
   */
  public getOrCreateClient(username: string, password: string): Promise<BlueAirAwsClient> {
    if (!this._clientPromises.has(username)) {
      const promise = (async () => {
        const client = new BlueAirAwsClient(username, password);
        await client.initialize();
        return client;
      })();
      this._clientPromises.set(username, promise);
    }
    return this._clientPromises.get(username)!;
  }

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit(): Promise<void> {
    this.log(`${this.constructor.name} has been initialized`);
  }

  /**
   * Handles the pairing process.
   * @param session - The pairing session.
   */
  async onPair(session: any): Promise<void> {
    let username = '';
    let password = '';

    session.setHandler(
      'login',
      async (data: { username: string; password: string }) => {
        username = data.username;
        password = data.password;

        try {
          const client = new BlueAirAwsClient(username, password);
          return await client.initialize();
        } catch (e) {
          this.log(e);
          return false;
        }
      }
    );

    session.setHandler('list_devices', async () => {
      try {
        const client = new BlueAirAwsClient(username, password);

        if (await client.initialize()) {
          const devicesList = await client.getDevices();

          if (!Array.isArray(devicesList)) {
            throw new Error('devicesList is not an array');
          }

          const compatibleDevices = await this.filterCompatibleDevices(
            devicesList,
            client,
            username,
            password
          );

          return compatibleDevices;
        }
        return null;
      } catch (error) {
        this.log('Error listing devices:', error);
        return { error: 'Failed to list devices' };
      }
    });
  }

  /**
   * Filters the list of devices based on the specific model.
   * @param devicesList - The list of devices from the API.
   * @param client - The BlueAir API client.
   * @param username - The user's username.
   * @param password - The user's password.
   * @returns A list of compatible devices.
   */
  protected async filterCompatibleDevices(
    devicesList: any[],
    client: BlueAirAwsClient,
    username: string,
    password: string
  ) {
    const compatibleDevices = [];
    const accountuuid = devicesList[0].name;

    for (const device of devicesList) {
      const deviceInfoArray = await client.getDeviceStatus(accountuuid, [
        device.uuid,
      ]);

      for (const deviceInfo of deviceInfoArray) {
        if (deviceInfo.model.toLowerCase().includes(this.deviceModelFilter)) {
          compatibleDevices.push({
            name: deviceInfo.name,
            data: {
              accountuuid,
              uuid: deviceInfo.id,
              mac: device.mac,
            },
            store: {
              name: deviceInfo.name,
            },
            settings: {
              username,
              password,
              region: Region.EU,
            },
          });
        }
      }
    }
    return compatibleDevices;
  }
}

export default BlueAirAwsBaseDriver;
