import { invoke } from '@tauri-apps/api/core';

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
}

const DEVICE_ID_KEY = 'ghostove_device_id';

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `hud_${crypto.randomUUID()}`
    : `hud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export async function getDeviceIdentity(existingDeviceId = getOrCreateDeviceId()): Promise<DeviceIdentity> {
  return invoke<DeviceIdentity>('get_device_identity', { existingDeviceId });
}

export async function signDeviceChallenge(challenge: string): Promise<string> {
  return invoke<string>('sign_device_challenge', { challenge });
}
