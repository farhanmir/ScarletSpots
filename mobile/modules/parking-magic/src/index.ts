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
  preciseLocationOk?: boolean;
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

export type AutoParkDecisionStatus = "ready" | "started" | "blocked";

export interface AutoParkGateCheck {
  key: string;
  label: string;
  passed: boolean;
  reasonCode: string | null;
  detail: string | null;
  rawValue: string | null;
}

export interface AutoParkLiveSnapshot {
  timestamp: number;
  source: string;
  decisionStatus: AutoParkDecisionStatus;
  decisionReasonCode: string;
  speedMps: number | null;
  horizontalAccuracy: number | null;
  locationAgeMs: number | null;
  cooldownRemainingMs: number;
  hasActiveAutoSession: boolean;
  isParkingEventInFlight: boolean;
  lotFound: boolean;
  lotId: string | null;
  lotName: string | null;
  triggerRecognized: boolean;
  checks: AutoParkGateCheck[];
}

export interface AutoParkDiagnosticsPayload {
  latest: AutoParkLiveSnapshot | null;
  history: AutoParkLiveSnapshot[];
}

export interface AutoParkDiagnosticsSummary {
  totalSnapshots: number;
  startedCount: number;
  blockedCount: number;
  readyCount: number;
  startRate: number;
  topBlockedReasons: Array<{ reasonCode: string; count: number }>;
  topFailedChecks: Array<{ checkKey: string; count: number }>;
}

declare class ParkingMagicModule extends NativeModule {
  startSensing(): void;
  stopSensing(): void;
  getSystemHealthAsync(): Promise<SystemHealthStatus>;
  syncUserData(
    url: string,
    token: string,
    permit: string,
    pinnedCertHashes: string[],
    ownerId: string,
  ): void;
  resetUserData(): void;
  requestPermissionsAsync(): Promise<boolean>;
  resolveLotAtAsync(latitude: number, longitude: number): Promise<ResolvedLot>;
  getLotPolygonsAsync(): Promise<LotPolygon[]>;
  getNativeSessionStateAsync(): Promise<NativeSessionState>;
  runAutoParkSmokeTestAsync(latitude: number, longitude: number): Promise<AutoParkSmokeTestResult>;
  getAutoParkDiagnosticsAsync(): Promise<AutoParkDiagnosticsPayload>;
  getAutoParkDiagnosticsSummaryAsync(): Promise<AutoParkDiagnosticsSummary>;
  clearAutoParkDiagnosticsAsync(): Promise<boolean>;
}

const module = requireNativeModule<ParkingMagicModule>('ParkingMagic');
const emitter = new EventEmitter(module);

function ensureString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function ensureFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`[ParkingMagic] Invalid ${name}: expected a finite number.`);
  }
  return value;
}

export function syncUserData(
  url: string,
  token: string,
  permit: string,
  pinnedCertHashes: string[] = [],
  ownerId: string | null = null,
) {
  const safeUrl = ensureString(url);
  const safeToken = ensureString(token);
  const safePermit = ensureString(permit, "Public");
  const safePins = ensureStringArray(pinnedCertHashes);
  const safeOwnerId = ensureString(ownerId ?? "");

  // Avoid passing null through TurboModule Function args; NSNull here can trigger
  // Obj-C invocation exceptions in release builds before JS can recover.
  module.syncUserData(safeUrl, safeToken, safePermit, safePins, safeOwnerId);
}

export function startSensing() {
  module.startSensing();
}

export function stopSensing() {
  module.stopSensing();
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

export function addAutoParkDiagnosticsListener(
  listener: (event: AutoParkLiveSnapshot) => void,
) {
  return emitter.addListener("onAutoParkDiagnostics", listener);
}

export async function getSystemHealth(): Promise<SystemHealthStatus> {
  return await module.getSystemHealthAsync();
}

export async function resolveLotAt(latitude: number, longitude: number): Promise<ResolvedLot> {
  const safeLatitude = ensureFiniteNumber(latitude, "latitude");
  const safeLongitude = ensureFiniteNumber(longitude, "longitude");
  return await module.resolveLotAtAsync(safeLatitude, safeLongitude);
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
  const safeLatitude = ensureFiniteNumber(latitude, "latitude");
  const safeLongitude = ensureFiniteNumber(longitude, "longitude");
  return await module.runAutoParkSmokeTestAsync(safeLatitude, safeLongitude);
}

export async function getAutoParkDiagnostics(): Promise<AutoParkDiagnosticsPayload> {
  return await module.getAutoParkDiagnosticsAsync();
}

export async function getAutoParkDiagnosticsSummary(): Promise<AutoParkDiagnosticsSummary> {
  return await module.getAutoParkDiagnosticsSummaryAsync();
}

export async function clearAutoParkDiagnostics(): Promise<boolean> {
  return await module.clearAutoParkDiagnosticsAsync();
}

export default module;
