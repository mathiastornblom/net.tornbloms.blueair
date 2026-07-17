import { Driver } from 'homey';
import { BlueAirAwsClient } from 'blueairaws-client';
import { Region } from 'blueairaws-client/dist/Consts';

abstract class BlueAirAwsBaseDriver extends Driver {
  protected abstract deviceModelFilters: string[];

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
      })().catch((err) => {
        // Remove the rejected promise so the next call retries fresh
        // instead of returning a permanently-cached rejection.
        this._clientPromises.delete(username);
        throw err;
      });
      this._clientPromises.set(username, promise);
    }
    return this._clientPromises.get(username)!;
  }

  public clearClient(username: string): void {
    this._clientPromises.delete(username);
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
    // Reused between the 'login' and 'list_devices' steps so pairing only
    // performs one Gigya login + homehost lookup instead of two.
    let client: BlueAirAwsClient | null = null;

    session.setHandler(
      'login',
      async (data: { username: string; password: string }) => {
        username = data.username;
        password = data.password;

        try {
          client = new BlueAirAwsClient(username, password);
          return await client.initialize();
        } catch (e) {
          this.log(e);
          client = null;
          return false;
        }
      }
    );

    session.setHandler('list_devices', async () => {
      try {
        if (!client) {
          client = new BlueAirAwsClient(username, password);
          if (!(await client.initialize())) {
            client = null;
          }
        }

        if (!client) {
          throw new Error('Unable to log in to BlueAir. Please check your credentials and try again.');
        }

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
      } catch (error) {
        this.log('Error listing devices:', error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to list devices: ${message}`);
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
        this.log(`[pair] device model="${deviceInfo.model}" name="${deviceInfo.name}" — filters="${this.deviceModelFilters.join('|')}"`);
        const modelLower = deviceInfo.model.toLowerCase();
        if (this.deviceModelFilters.some((f) => modelLower.includes(f))) {
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
