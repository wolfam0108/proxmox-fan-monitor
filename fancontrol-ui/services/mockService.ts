import { SystemData, ChartDataPoint } from '../types';

// Initial state simulation
let cpuTemp = 42.0;
let gpuTemp = 35.0;
let hddMax = 39.0;
let sysMode = '1';
let gpuMode = '0';
let tickCount = 0;

// Helper to drift values realistically
const drift = (val: number, min: number, max: number, volatility: number = 1) => {
  const change = (Math.random() - 0.5) * volatility;
  let newVal = val + change;
  return Math.min(Math.max(newVal, min), max);
};

export const fetchSystemData = async (): Promise<SystemData> => {
  // Simulate network latency
  await new Promise(resolve => setTimeout(resolve, 200));

  tickCount++;

  // 1. Simulate Sensor Drift
  cpuTemp = drift(cpuTemp, 30, 85, 2.5);
  gpuTemp = drift(gpuTemp, 30, 90, 1.5);
  hddMax = drift(hddMax, 30, 50, 0.2);

  // 2. Simulate Logic (Simplified version of Python script)
  // System Logic
  let sysTarget: number | string = 1200;
  let sysStatus = "Stable";
  
  if (cpuTemp > 62 || gpuTemp > 82) {
    sysMode = '3';
    sysTarget = 2000;
    sysStatus = "Escalated";
  } else if (cpuTemp > 57) {
    sysMode = '2';
    sysTarget = 1600;
    if (Math.random() > 0.8) sysStatus = "Pending Lvl3 (2.5s)"; // Fake pending
  } else {
    sysMode = '1';
    sysTarget = 1200;
    if (Math.random() > 0.9) sysStatus = "Locked (Hold 12s)"; // Fake hold
  }

  // GPU Logic
  let gpuTarget: number | string = "Auto";
  let gpuPct = 0;
  let gpuStatus = "Stable";

  if (gpuTemp > 60) {
    gpuMode = '1';
    gpuTarget = "45%";
    gpuPct = 45;
  } else {
    gpuMode = '0';
    gpuTarget = "Auto";
    gpuPct = 0;
  }

  // 3. Construct Response
  return {
    timestamp: Date.now(),
    temps: {
      cpu: parseFloat(cpuTemp.toFixed(1)),
      gpu: Math.round(gpuTemp),
      hddMax: Math.round(hddMax),
      hddList: [
        { device: 'sdc', temp: Math.round(hddMax - 3) },
        { device: 'sdd', temp: Math.round(hddMax) },
        { device: 'sde', temp: Math.round(hddMax - 1) },
        { device: 'sdf', temp: Math.round(hddMax - 1) },
      ]
    },
    logic: {
      system: {
        mode: sysMode,
        target: sysTarget,
        status: sysStatus
      },
      gpu: {
        mode: gpuMode,
        target: gpuTarget,
        status: gpuStatus
      }
    },
    fans: [
      {
        id: 'fan2',
        name: 'Fan2 (Front)',
        type: 'SYS',
        rpm: Math.round((typeof sysTarget === 'number' ? sysTarget : 1200) + (Math.random() * 20 - 10)),
        target: sysTarget,
        pwmOrPct: 56 + (sysMode === '1' ? 0 : 40),
        status: 'OK'
      },
      {
        id: 'fan3',
        name: 'Fan3 (Rear)',
        type: 'SYS',
        rpm: Math.round((typeof sysTarget === 'number' ? sysTarget : 1200) + (Math.random() * 20 - 10)),
        target: sysTarget,
        pwmOrPct: 122 + (sysMode === '1' ? 0 : 40),
        status: Math.random() > 0.9 ? 'ADJ' : 'OK'
      },
      {
        id: 'gpu_fan0',
        name: 'GPU Fan 1',
        type: 'GPU',
        rpm: gpuMode === '0' ? 0 : 1500,
        target: gpuTarget,
        pwmOrPct: gpuPct,
        status: 'OK'
      },
      {
        id: 'gpu_fan1',
        name: 'GPU Fan 2',
        type: 'GPU',
        rpm: gpuMode === '0' ? 0 : 1480,
        target: gpuTarget,
        pwmOrPct: gpuPct,
        status: 'OK'
      }
    ]
  };
};