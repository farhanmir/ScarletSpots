import { EventEmitter, NativeModule, requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import { ViewProps } from 'react-native';

export type MapViewProps = ViewProps & {
  selectedLotId?: string;
  onLotPress?: (event: { nativeEvent: { lotId: string } }) => void;
};

const NativeMapView: React.ComponentType<MapViewProps> = requireNativeViewManager('ParkingMagic');

export function MapView(props: MapViewProps) {
  return React.createElement(NativeMapView, props);
}

export interface ParkingEvent {
  latitude: number;
  longitude: number;
  source: 'bluetooth_disconnect' | 'carplay_disconnect' | 'motion_activity' | 'significant_location';
  timestamp: number;
}

export interface SystemHealthStatus {
  ok: boolean;
  reasons: string[];
  backgroundLocationOk: boolean;
  motionOk: boolean;
  bluetoothOk: boolean;
}

declare class ParkingMagicModule extends NativeModule {
  startSensing(): void;
  stopSensing(): void;
  getSystemHealthAsync(): Promise<SystemHealthStatus>;
  syncUserData(url: String, token: String, permit: String): void;
  resetUserData(): void;
  requestPermissionsAsync(): Promise<boolean>;
}

const module = requireNativeModule<ParkingMagicModule>('ParkingMagic');
const emitter = new EventEmitter(module);

export function syncUserData(url: string, token: string, permit: string) {
  module.syncUserData(url, token, permit);
}

export function resetUserData() {
  module.resetUserData();
}

export async function requestPermissionsAsync(): Promise<boolean> {
  return await module.requestPermissionsAsync();
}

export function addParkingListener(listener: (event: ParkingEvent) => void) {
  return emitter.addListener('onParkingEvent', listener);
}

export async function getSystemHealth(): Promise<SystemHealthStatus> {
  return await module.getSystemHealthAsync();
}

export default module;
