// Represents the logic state from the Python script (e.g. "Stable", "Pending Lvl2")
export interface LogicState {
  mode: string;
  target: string | number; // "Auto", "1200", or "45%"
  status: string; // "Stable", "Escalated", "Pending...", "Locked", "MANUAL"
  isManual?: boolean;
}

export interface OverrideState {
  enabled: boolean;
  mode: string;
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
  logic: {
    system: LogicState;
    gpu: LogicState;
  };
  fans: Fan[];
}

export interface ChartDataPoint {
  time: string;
  timestamp?: number;
  cpu: number;
  gpu: number;
  hdd: number;
  sysFanRpm: number;
  gpuFanRpm: number;
  sysMode: number;
  gpuMode: number;
}

export type TimeRange = '1m' | '5m' | '30m' | '1h' | '6h' | '1d' | '1w' | '1mo';

export interface FanConfig {
  system: {
    targets: Record<string, number>;
    thresholds: Record<string, number[]>;
    delay_up: number;
    hold_time: Record<string, number>;
  };
  gpu: {
    targets: Record<string, number>;
    thresholds: Record<string, number[]>;
    delay_up: number;
    hold_time: Record<string, number>;
  };
}