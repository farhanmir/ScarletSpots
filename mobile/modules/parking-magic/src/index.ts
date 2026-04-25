import { EventEmitter, NativeModule, requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import * as React from 'react';
import { ViewProps } from 'react-native';

export type MapViewProps = ViewProps & {
  selectedLotId?: string;
  onLotPress?: (event: { nativeEvent: { lotId: string; lotName?: string } }) => void;
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
  lotId?: string;
  message?: string;
}

export interface ResolvedLot {
  found: boolean;
  lotId: string | null;
  lotName: string | null;
}

export interface LotPolygonPoint {
  lat: number;
  lng: number;
}

export interface LotPolygon {
  id: string;
  name: string;
  rings: LotPolygonPoint[][];
}

export interface SystemHealthStatus {
  ok: boolean;
  reasons: string[];
  backgroundLocationOk: boolean;
  motionOk: boolean;
  bluetoothOk: boolean;
}

export interface NativeSessionState {
  activeAutoSession: boolean;
  isParkingEventInFlight: boolean;
  isEndingSession: boolean;
  pendingEventSource: string | null;
}

export interface AutoParkSmokeTestResult {
  ok: boolean;
  startSuccess: boolean;
  endSuccess: boolean;
  activeAfter: boolean;
  error: string | null;
}

declare class ParkingMagicModule extends NativeModule {
  startSensing(): void;
  stopSensing(): void;
  getSystemHealthAsync(): Promise<SystemHealthStatus>;
  syncUserData(url: string, token: string, permit: string): void;
  resetUserData(): void;
  requestPermissionsAsync(): Promise<boolean>;
  resolveLotAtAsync(latitude: number, longitude: number): Promise<ResolvedLot>;
  getLotPolygonsAsync(): Promise<LotPolygon[]>;
  getNativeSessionStateAsync(): Promise<NativeSessionState>;
  runAutoParkSmokeTestAsync(latitude: number, longitude: number): Promise<AutoParkSmokeTestResult>;
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

export async function resolveLotAt(latitude: number, longitude: number): Promise<ResolvedLot> {
  return await module.resolveLotAtAsync(latitude, longitude);
}

export async function getLotPolygons(): Promise<LotPolygon[]> {
  return await module.getLotPolygonsAsync();
}

export async function getNativeSessionState(): Promise<NativeSessionState> {
  return await module.getNativeSessionStateAsync();
}

export async function runAutoParkSmokeTest(
  latitude: number,
  longitude: number,
): Promise<AutoParkSmokeTestResult> {
  return await module.runAutoParkSmokeTestAsync(latitude, longitude);
}

export default module;
