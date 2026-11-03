/**
 * IAP service resolver: the real App Store / Google Play service (nativeService.ts, expo-iap) on
 * iOS and Android, and a safe stand-in elsewhere (web) that never grants anything.
 */
import { Platform } from 'react-native';
import { createNativeIapService } from './nativeService';
import { IapError, type IapService } from './types';

function createUnsupportedIapService(): IapService {
  const unavailable = () =>
    new IapError('unavailable', 'In-app purchases aren’t available here.');
  return {
    isSupported: () => false,
    getCatalog: async () => null,
    isTrialEligible: async () => false,
    purchase: async () => {
      throw unavailable();
    },
    restorePurchases: async () => {
      throw unavailable();
    },
    start: () => () => undefined,
    manage: async () => undefined,
  };
}

let instance: IapService | null = null;

/** The active IAP service (one per app run). */
export function getIapService(): IapService {
  if (!instance) {
    instance =
      Platform.OS === 'ios' || Platform.OS === 'android'
        ? createNativeIapService()
        : createUnsupportedIapService();
  }
  return instance;
}

/** Tests only: start again with a fresh service. */
export function resetIapServiceForTests(): void {
  instance = null;
}
