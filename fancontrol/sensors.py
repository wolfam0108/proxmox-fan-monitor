"""
Sensors Module

Handles reading temperature values from CPU, GPU, and drives.
"""
import subprocess
import json
import glob
import os

from . import drives


def get_vals(current_config):
    """Read all sensor values: CPU temp, GPU temp, HDD temps, GPU fan stats"""
    from . import cpu_scanner
    from . import config as cfg
    
    
    # 1. Read configured modular sensors
    # This returns { 'sensor_id': value }
    from . import sensor_manager
    sensor_values = sensor_manager.get_all_sensor_values(current_config.get('sensors', []))
    
    # 2. Legacy/Fallback reads
    
    # CPU fallback
    if 'cpu' not in sensor_values and current_config.get('cpu_sensor_path'):
        try:
            val = cpu_scanner.read_temp(current_config['cpu_sensor_path'])
            if val is not None:
                sensor_values['cpu'] = val
        except:
            pass
            
    # GPU fallback (if nvidia group exists but no 'gpu' sensor configured)
    gpu_group = cfg.get_nvidia_group()
    if 'gpu' not in sensor_values and gpu_group:
        try:
            # Try to read straight from nvidia-smi if not configured as sensor
            out = subprocess.check_output(
                ['nvidia-smi', '--query-gpu=temperature.gpu', '--format=csv,noheader'],
                stderr=subprocess.DEVNULL
            )
            sensor_values['gpu'] = int(out.strip())
        except:
            pass

    # Read GPU fans (independent of sensor system for now)
    gpu_fans = {}
    if gpu_group:
        try:
            gpu_cfg = gpu_group.get('gpu_config', {})
            display = gpu_cfg.get('display', ':0')
            fan_indices = gpu_cfg.get('fans', [0, 1])
            
            gpu_fans = {f'fan{i}': {'rpm': 0, 'pct': 0} for i in fan_indices}
            
            # Build dynamic nvidia-settings command
            cmd = ['nvidia-settings', '-c', display, '-t']
            for i in fan_indices:
                cmd.extend(['-q', f'[fan:{i}]/GPUCurrentFanSpeedRPM'])
                cmd.extend(['-q', f'[fan:{i}]/GPUCurrentFanSpeed'])
            
            out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode().strip().split('\n')
            
            for idx, fan_idx in enumerate(fan_indices):
                base = idx * 2
                if base + 1 < len(out):
                    rpm = int(out[base]) if out[base].strip().isdigit() else 0
                    pct = int(out[base + 1]) if out[base + 1].strip().isdigit() else 0
                    gpu_fans[f'fan{fan_idx}'] = {'rpm': rpm, 'pct': pct}
        except:
            pass

    # HDD Logic
    # Legacy: calculate max temp of monitored drives
    hdd_max = -100
    hdd_all = {}
    hdd_by_serial = {}
    
    try:
        configured_drives = drives.get_configured_drives(current_config)
        
        for drive_info in configured_drives:
            device_path = drive_info.get('device', '')
            serial = drive_info.get('serial', '')
            d = device_path.replace('/dev/', '')
            
            if not d: continue
            
            val = None
            # Check if this drive is covered by a 'drive' sensor
            # This is complex because sensors map to devices/serials. 
            # For now, we keep legacy scan for HDD logic to ensure 'hddMax' works for legacy configs
            # Ideally we should migrate drives to sensors too.
            
            try:
                # Reuse code or call drive scanner? 
                # Calling subprocess here again is inefficient if sensor_manager already did it.
                # But sensor_manager only reads CONFIGURED sensors.
                # Here we read configured DRIVES (legacy config).
                
                o = subprocess.check_output(['smartctl', '-j', '-A', device_path], stderr=subprocess.DEVNULL, timeout=5)
                j = json.loads(o)
                t = j.get('temperature', {}).get('current')
                if t is None:
                    for a in j.get('ata_smart_attributes', {}).get('table', []):
                        if a['id'] == 194:
                            t = a['raw']['value'] & 0xFF
                            break
                if t is None and 'nvme_smart_health_information_log' in j:
                    t = j['nvme_smart_health_information_log'].get('temperature')
                
                if t is not None:
                    hdd_all[d] = t
                    if serial: hdd_by_serial[serial] = t
                    if t > hdd_max: hdd_max = t
            except:
                hdd_all[d] = 'Err'
                
    except:
        pass
        
    final_hdd = hdd_max if hdd_max != -100 else 0
    
    # Ensure standard keys exist in sensor_values so controllers can find them
    if 'cpu' not in sensor_values and 'cpu' in current_config.get('cpu_sensor_path', ''):
        # Already handled above
        pass
        
    return sensor_values.get('cpu'), sensor_values.get('gpu'), final_hdd, hdd_all, gpu_fans, hdd_by_serial, sensor_values


def get_it8613_path():
    """Find path to IT8613 hardware monitor"""
    for p in glob.glob('/sys/class/hwmon/hwmon*'):
        try:
            if open(os.path.join(p, 'name')).read().strip() == 'it8613':
                return p
        except:
            continue
    return None
