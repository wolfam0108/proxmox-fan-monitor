import { SystemData, ChartDataPoint, FanConfig, TimeRange } from '../types';

const API_BASE = '';  // Same origin

export const fetchSystemData = async (): Promise<SystemData> => {
    const res = await fetch(`${API_BASE}/api/status`);
    if (!res.ok) throw new Error('API unavailable');
    return res.json();
};

export const fetchHistory = async (range: TimeRange = '30m'): Promise<ChartDataPoint[]> => {
    const res = await fetch(`${API_BASE}/api/history?range=${range}`);
    if (!res.ok) return [];
    return res.json();
};

export const fetchConfig = async (): Promise<FanConfig> => {
    const res = await fetch(`${API_BASE}/api/config`);
    if (!res.ok) throw new Error('Failed to load config');
    return res.json();
};

export const saveConfig = async (config: FanConfig): Promise<{ success: boolean; message?: string; error?: string }> => {
    const res = await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    return res.json();
};

export const restartService = async (): Promise<{ success: boolean; message?: string }> => {
    const res = await fetch(`${API_BASE}/api/restart`, {
        method: 'POST'
    });
    return res.json();
};

export const setOverride = async (
    type: 'system' | 'gpu',
    enabled: boolean,
    mode: string,
    save: boolean = false
): Promise<{ success: boolean; override?: any }> => {
    const res = await fetch(`${API_BASE}/api/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, enabled, mode, save })
    });
    return res.json();
};



// Fan scanner API
export const scanFans = async (): Promise<import('../types').FanScanResult> => {
    const res = await fetch(`${API_BASE}/api/fans/scan`);
    if (!res.ok) throw new Error('Failed to scan fans');
    return res.json();
};

export const getFansRpm = async (): Promise<{ fans: Record<string, number> }> => {
    const res = await fetch(`${API_BASE}/api/fans/rpm`);
    if (!res.ok) throw new Error('Failed to get fan RPM');
    return res.json();
};

export const testPwm = async (
    pwm_path: string,
    value: number
): Promise<{ success: boolean; previous_value?: number; error?: string }> => {
    const res = await fetch(`${API_BASE}/api/fans/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pwm_path, value })
    });
    return res.json();
};

export const saveFanGroup = async (
    group: {
        id: string;
        name: string;
        temp_sources: import('../types').TempSource[];
        fans: import('../types').FanPwmMapping[];
    }
): Promise<{ success: boolean; message?: string; error?: string; group?: import('../types').FanGroup }> => {
    const res = await fetch(`${API_BASE}/api/fan-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(group)
    });
    return res.json();
};

// GPU scanner API
export interface GpuInfo {
    index: number;
    name: string;
    uuid: string;
    fans: number[];
    fan_count: number;
    temperature: number;
    display: string;
}

export interface GpuScanResult {
    gpus: GpuInfo[];
    display: string;
    summary: {
        total_gpus: number;
        total_fans: number;
    };
}

export const scanGpus = async (): Promise<GpuScanResult> => {
    const res = await fetch(`${API_BASE}/api/gpu/scan`);
    if (!res.ok) throw new Error('Failed to scan GPUs');
    return res.json();
};

export const getGpuFans = async (): Promise<{
    fans: Record<number, { rpm: number; pct: number }>;
    display: string;
    gpu_index: number;
}> => {
    const res = await fetch(`${API_BASE}/api/gpu/fans`);
    if (!res.ok) throw new Error('Failed to get GPU fans');
    return res.json();
};

export const testGpuFan = async (
    fan_index: number,
    target_pct: number,
    gpu_index: number = 0,
    display: string = ':0'
): Promise<{ success: boolean; previous_pct?: number; error?: string }> => {
    const res = await fetch(`${API_BASE}/api/gpu/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fan_index, target_pct, gpu_index, display })
    });
    return res.json();
};

export const saveGpuGroup = async (
    config: {
        name?: string;
        display: string;
        gpu_index: number;
        fans: number[];
    }
): Promise<{ success: boolean; message?: string; error?: string; group?: import('../types').FanGroup }> => {
    const res = await fetch(`${API_BASE}/api/gpu-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    return res.json();
};

// CPU sensor scanner API
export interface CpuSensorInfo {
    path: string;
    hwmon: string;
    name: string;
    label: string;
    value: number;
    temp_id: string;
    recommended: boolean;
}

export interface CpuScanResult {
    sensors: CpuSensorInfo[];
    recommended: string | null;
    summary: {
        total: number;
        cpu_sensors: number;
    };
}

export const scanCpuSensors = async (): Promise<CpuScanResult> => {
    const res = await fetch(`${API_BASE}/api/cpu/scan`);
    if (!res.ok) throw new Error('Failed to scan CPU sensors');
    return res.json();
};

export const saveCpuSensor = async (
    path: string
): Promise<{ success: boolean; message?: string; error?: string }> => {
    const res = await fetch(`${API_BASE}/api/cpu/sensor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    });
    return res.json();
};
