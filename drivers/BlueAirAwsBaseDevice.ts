import { Device } from 'homey';
import { BlueAirAwsClient } from 'blueairaws-client';
import { BlueAirDeviceStatus } from 'blueairaws-client/dist/Consts';
import BlueAirAwsBaseDriver from './BlueAirAwsBaseDriver';

const MIN_POLL_INTERVAL_MS = 60_000;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Abstract base class for all BlueAir AWS devices.
 *
 * Handles:
 * - Shared client management (via BlueAirAwsBaseDriver)
 * - Single polling interval (no duplicate intervals)
 * - Consecutive failure tracking → setUnavailable after MAX_CONSECUTIVE_FAILURES
 * - setAvailable on recovery
 * - Re-authentication on Gigya session / rate-limit errors
 * - Minimum poll interval enforcement (60 s)
 * - safeSetCommand: reverts capability value if an API command fails
 */
abstract class BlueAirAwsBaseDevice extends Device {
  protected client: BlueAirAwsClient | null = null;

  /** True after the first successful status fetch — subclasses use this to skip
   *  flow-card triggers on the initial load. */
  protected isInitialized = false;

  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;

  // ── Abstract interface ────────────────────────────────────────────────────

  /** Capability IDs that must exist on this device. */
  protected abstract readonly deviceCapabilities: string[];

  /**
   * Called on initial load and on every successful poll.
   * Subclasses update capability values and (when isInitialized is true)
   * trigger flow cards for changed values.
   */
  protected abstract applyStatus(
    attrs: BlueAirDeviceStatus[],
    settings: Record<string, any>
  ): void;

  /**
   * Called once after the first successful status fetch.
   * Subclasses register capability listeners and flow/action/condition cards.
   */
  protected abstract setupListeners(
    client: BlueAirAwsClient,
    data: Record<string, any>,
    settings: Record<string, any>
  ): void;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async onInit(): Promise<void> {
    const settings = this.getSettings();
    const data = this.getData();

    // One-time migration: remove old capability ID that used wrong name
    if (this.hasCapability('measure_tVOC')) {
      await this.removeCapability('measure_tVOC');
    }

    // Ensure all required capabilities exist
    for (const cap of this.deviceCapabilities) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap);
      }
    }

    // Enforce minimum poll interval regardless of user setting
    const pollMs = Math.max(
      (settings.update as number) * 1000,
      MIN_POLL_INTERVAL_MS
    );

    try {
      const driver = this.driver as BlueAirAwsBaseDriver;
      this.client = await driver.getOrCreateClient(
        settings.username as string,
        settings.password as string
      );
      const client = this.client;

      // Initial fetch — isInitialized is false, so no flow cards fire
      const attrs = await client.getDeviceStatus(data.accountuuid, [data.uuid]);
      this.applyStatus(attrs, settings);
      this.syncDeviceInfo(attrs);
      this.setupListeners(client, data, settings);

      // Mark initialized before starting the poll loop
      this.isInitialized = true;

      this.pollIntervalId = setInterval(async () => {
        try {
          const attrs = await client.getDeviceStatus(data.accountuuid, [data.uuid]);
          this.applyStatus(attrs, settings);
          this.syncDeviceInfo(attrs);
          this.onPollSuccess();
        } catch (error) {
          await this.onPollFailure(error, client);
        }
      }, pollMs);

      this.log(`${this.constructor.name} initialized (poll every ${pollMs / 1000}s)`);
    } catch (e) {
      this.error('Error during initialization:', e);
      this.setUnavailable('Initialization failed').catch(this.error);
    }
  }

  async onDeleted(): Promise<void> {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Persists device metadata (firmware, MAC, etc.) into Homey settings. */
  private syncDeviceInfo(attrs: BlueAirDeviceStatus[]): void {
    if (!attrs[0]) return;
    this.setSettings({
      uuid: attrs[0].id,
      name: attrs[0].name,
      model: attrs[0].model,
      mac: attrs[0].mac,
      serial: attrs[0].serial,
      mcuFirmware: attrs[0].mcu,
      wlanDriver: attrs[0].wifi,
    });
  }

  private onPollSuccess(): void {
    if (this.consecutiveFailures > 0) {
      this.consecutiveFailures = 0;
      this.setAvailable().catch(this.error);
    }
  }

  private async onPollFailure(
    error: unknown,
    client: BlueAirAwsClient
  ): Promise<void> {
    this.log('Polling error:', error);
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      this.setUnavailable('Device unreachable — API error').catch(this.error);
    }

    // Attempt re-authentication on session / rate-limit errors
    const msg = String(error).toLowerCase();
    if (
      msg.includes('session') ||
      msg.includes('rate limit') ||
      msg.includes('403') ||
      msg.includes('401') ||
      msg.includes('229')
    ) {
      this.log('Session/rate-limit error — attempting re-authentication...');
      try {
        await client.initialize();
        this.log('Re-authentication successful');
      } catch (authError) {
        this.log('Re-authentication failed:', authError);
      }
    }
  }

  /**
   * Wraps an API command for a capability listener.
   * If the command throws, the capability is reverted to its previous value
   * and the error is re-thrown so Homey can show the failure in the UI.
   */
  protected async safeSetCommand(
    capability: string,
    command: () => Promise<void>
  ): Promise<void> {
    const oldValue = this.getCapabilityValue(capability);
    try {
      await command();
    } catch (error) {
      this.error(`Command failed for ${capability}:`, error);
      this.setCapabilityValue(capability, oldValue).catch(this.error);
      throw error;
    }
  }
}

export default BlueAirAwsBaseDevice;
