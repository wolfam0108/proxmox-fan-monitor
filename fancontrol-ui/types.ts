// Represents the logic state from the Python script (e.g. "Stable", "Pending Lvl2")
export interface LogicState {
  mode: string;
  target: string | number; // "Auto", "1200", or "45%"
  status: string; // "Stable", "Escalated", "Pending...", "Locked", "MANUAL"
  isManual?: boolean;
}

export interface OverrideState {
  enabled: boolean;
  mode: number;
}

export interface Fan {
  id: string;
  name: string;
  rpm: number;
  target: string | number;
  pwmOrPct: number; // PWM (0-255) for System, % (0-100) for GPU
  status: 'OK' | 'ADJ';
  type: 'SYS' | 'GPU';
}

// Alias for components
export type FanData = Fan;

export interface HddTemp {
  device: string;
  temp: number | string;
}

export interface SystemData {
  timestamp: number;
  temps: {
    cpu: number;
    gpu: number;
    hddMax: number;
    hddList: HddTemp[];
  };
  logic: Record<string, LogicState>; // Dynamic group keys
  fans: Fan[];
  sensors: SensorData[];
}

export interface SensorSourceDetail {
  label: string;
  value: number | null;
  type: 'hwmon' | 'nvidia' | 'drive';
  chip?: string;
  hwmon?: string;
  // Drive details
  details?: {
    model: string;
    serial: string;
    size: string;
    temp: number | null;
    interface: string;
    type: string;
    form_factor: string;
  };
  device?: string;
}

export interface SensorData {
  id: string;
  name: string;
  type: string;
  visual_preset: 'system' | 'accelerator' | 'storage' | 'custom';
  value: number | null;
  sources: SensorSourceDetail[];
}

export interface ChartDataPoint {
  time: string;
  timestamp?: number;
  cpu: number;
  gpu: number;
  temps?: Record<string, number>;
  sensors?: { id: string; name: string; value: number; type: string; sources?: SensorSourceDetail[] }[];
  logic?: Record<string, any>; // LogicState but simplified for history
  fans: Record<string, number>;
  sysMode?: number;
  gpuMode?: number;
}

export type TimeRange = '1m' | '5m' | '30m' | '1h' | '6h' | '1d' | '1w' | '1mo';

// New profile-based config types
export interface FanProfileThresholds {
  [key: string]: number | null | undefined;
}

export interface FanProfile {
  name: string;
  target: number;
  thresholds: FanProfileThresholds;
}

export interface FanSectionConfig {
  profiles: FanProfile[];
  delay_up: number;
  hold_time: number;
}

export interface FanConfig {
  system: FanSectionConfig;
  gpu: FanSectionConfig;
  override: Record<string, OverrideState>;
  drives?: {
    monitored: string[];
  };
  fan_groups?: FanGroup[];
  sensors?: any[];
}

// Drive configuration types
export interface DriveInfo {
  serial: string;
  device: string;
  model: string;
  size: string;
  type: 'HDD' | 'SSD' | 'NVMe';
  temperature: number | null;
}

// Drive temperature history point
export interface DriveHistoryPoint {
  time: string;
  timestamp: number;
  temp: number;
}

// Fan scanner types
export interface HwmonFan {
  id: string;
  input_path: string;
  rpm: number;
  label?: string;
}

export interface HwmonPwm {
  id: string;
  path: string;
  value: number;
  controllable: boolean;
  enable_path?: string;
  enable?: number;
}

export interface HwmonDevice {
  path: string;
  name: string;
  fans: HwmonFan[];
  pwms: HwmonPwm[];
}

// Unified fan allocatable entity
export interface AllocatableFan {
  id: string; // Unique ID (e.g. "it8613/fan2" or "gpu0_fan0")
  name: string;
  type: 'system' | 'nvidia';
  rpm: number;
  // System specific
  input_path?: string;
  chip?: string;
  available_pwms?: HwmonPwm[];
  // GPU specific
  gpu_index?: number;
  fan_index?: number;
  uuid?: string;
  display?: string;
}

export interface FanScanResult {
  success: boolean;
  fans: AllocatableFan[];
  system_devices: HwmonDevice[]; // Kept for reference
  driver_status: {
    available: boolean;
    gpu_count: number;
  };
}

// Fan-PWM mapping for configuration
export interface FanPwmMapping {
  name: string;
  fan_input?: string;
  pwm_path?: string;
  fan_id: string;
  pwm_id?: string;
  type?: 'system' | 'nvidia';
  gpu_index?: number;
  fan_index?: number;
  display?: string;
}

// Fan group configuration
export type TempSource = string;

export interface FanGroup {
  id: string;
  name: string;
  type: 'system' | 'nvidia';
  visual_style?: string;
  temp_sources: TempSource[];
  fans: FanPwmMapping[];
  profiles: FanProfile[];
  delay_up: number;
  hold_time: number;
}