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
