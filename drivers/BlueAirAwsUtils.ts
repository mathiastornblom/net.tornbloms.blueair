import {
  BlueAirDeviceStatus,
  BlueAirDeviceState,
  BlueAirDeviceSensorData,
} from 'blueairaws-client/dist/Consts';

export interface DeviceSetting {
  name: string;
  value: string;
}

/**
 * Searches device status data for a named attribute, checking both state and sensorData.
 */
export function filterSettings(
  devices: BlueAirDeviceStatus[],
  itemName: string
): DeviceSetting | null {
  for (const device of devices) {
    if (itemName in device.state) {
      const v = device.state[itemName as keyof BlueAirDeviceState];
      if (v !== undefined && v !== null) return { name: itemName, value: String(v) };
    }
    if (itemName in device.sensorData) {
      const v = device.sensorData[itemName as keyof BlueAirDeviceSensorData];
      if (v !== undefined && v !== null) return { name: itemName, value: String(v) };
    }
  }
  return null;
}

/**
 * Returns the remaining filter life as a percentage string (e.g. "83 %"), or null.
 */
export function calculateRemainingFilterLife(devices: BlueAirDeviceStatus[]): string | null {
  const usage = filterSettings(devices, 'filterusage');
  if (usage?.value) {
    return `${100 - Number(usage.value)} %`;
  }
  return null;
}

/**
 * Enum representing different air quality levels.
 */
/* eslint-disable no-unused-vars */
export enum AirQuality {
  Excellent = 'excellent',
  Good = 'good',
  Fair = 'fair',
  Poor = 'poor',
  VeryPoor = 'verypoor',
}
/* eslint-enable no-unused-vars */

/**
 * Converts a PM2.5 index value to an AirQuality category.
 *
 * @param index - The PM2.5 index value, representing the concentration of particles
 *                less than 2.5 micrometers in diameter in the air.
 * @returns An AirQuality enum value representing the air quality category.
 */
export function conditionScorePm25ToString(index: number): AirQuality {
  if (index > 150.4) {
    return AirQuality.VeryPoor;
  }
  if (index > 55.4) {
    return AirQuality.Poor;
  }
  if (index > 35.4) {
    return AirQuality.Fair;
  }
  if (index > 12) {
    return AirQuality.Good;
  }
  return AirQuality.Excellent;
}

/**
 * Converts a PM1 index value to an AirQuality category.
 *
 * @param index - The PM1 index value, representing the concentration of particles
 *                less than 1 micrometer in diameter in the air.
 * @returns An AirQuality enum value representing the air quality category.
 */
export function conditionScorePm1ToString(index: number): AirQuality {
  if (index > 40) {
    return AirQuality.VeryPoor;
  }
  if (index > 31) {
    return AirQuality.Poor;
  }
  if (index > 21) {
    return AirQuality.Fair;
  }
  if (index > 11) {
    return AirQuality.Good;
  }
  return AirQuality.Excellent;
}

/**
 * Converts a PM10 index value to an AirQuality category.
 *
 * @param index - The PM10 index value, representing the concentration of particles
 *                less than 10 micrometers in diameter in the air.
 * @returns An AirQuality enum value representing the air quality category.
 */
export function conditionScorePm10ToString(index: number): AirQuality {
  if (index > 300) {
    return AirQuality.VeryPoor;
  }
  if (index > 100) {
    return AirQuality.Poor;
  }
  if (index > 50) {
    return AirQuality.Fair;
  }
  if (index > 20) {
    return AirQuality.Good;
  }
  return AirQuality.Excellent;
}

/**
 * Converts a tVOC index value to an AirQuality category.
 *
 * @param index - The tVOC index value, representing the concentration of total
 *                volatile organic compounds in the air.
 * @returns An AirQuality enum value representing the air quality category.
 */
export function conditionScoretVOCToString(index: number): AirQuality {
  if (index > 2200) {
    return AirQuality.VeryPoor;
  }
  if (index > 660) {
    return AirQuality.Poor;
  }
  if (index > 220) {
    return AirQuality.Fair;
  }
  if (index > 20) {
    return AirQuality.Good;
  }
  return AirQuality.Excellent;
}
