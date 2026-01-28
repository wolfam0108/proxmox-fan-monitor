"""
CPU Temperature Sensor Scanner Module

Scans for temperature sensors in /sys/class/hwmon.
Provides functions for discovering and reading CPU temperature sensors.
"""
import glob
import os
from typing import List, Dict, Optional


def scan_temp_sensors() -> List[Dict]:
    """
    Scan all temperature sensors in /sys/class/hwmon.
    
    Returns list of:
    {
        'path': '/sys/class/hwmon/hwmon2/temp1_input',
        'hwmon': 'hwmon2',
        'name': 'coretemp',
        'label': 'Package id 0',
        'value': 45.0,
        'temp_id': 'temp1'
    }
    """
    sensors = []
    
    for hwmon_path in sorted(glob.glob('/sys/class/hwmon/hwmon*')):
        hwmon_name = os.path.basename(hwmon_path)
        
        # Get chip name
        name = ''
        try:
            with open(os.path.join(hwmon_path, 'name'), 'r') as f:
                name = f.read().strip()
        except:
            continue
        
        # Find all temperature inputs
        for temp_input in sorted(glob.glob(os.path.join(hwmon_path, 'temp*_input'))):
            temp_id = os.path.basename(temp_input).replace('_input', '')
            
            # Read current value
            value = 0.0
            try:
                with open(temp_input, 'r') as f:
                    value = int(f.read().strip()) / 1000.0
            except:
                continue
            
            # Try to read label
            label = ''
            label_path = temp_input.replace('_input', '_label')
            try:
                with open(label_path, 'r') as f:
                    label = f.read().strip()
            except:
                pass
            
            sensors.append({
                'path': temp_input,
                'hwmon': hwmon_name,
                'name': name,
                'label': label or f'{name} {temp_id}',
                'value': value,
                'temp_id': temp_id
            })
    
    return sensors


def get_cpu_sensors() -> List[Dict]:
    """
    Get temperature sensors that are likely CPU sensors.
    Filters by common CPU-related names.
    """
    all_sensors = scan_temp_sensors()
    
    # Known CPU sensor names
    cpu_names = ['coretemp', 'k10temp', 'zenpower', 'it8613', 'nct6775', 
                 'nct6776', 'it8686', 'amdgpu']  # amdgpu for APUs
    
    cpu_sensors = []
    other_sensors = []
    
    for sensor in all_sensors:
        name = sensor['name'].lower()
        label = sensor['label'].lower()
        
        # Check if it's a known CPU sensor
        is_cpu = any(cpu_name in name for cpu_name in cpu_names)
        
        # Also check label for CPU-related keywords
        cpu_labels = ['package', 'core', 'tctl', 'tdie', 'cpu']
        is_cpu_label = any(kw in label for kw in cpu_labels)
        
        if is_cpu or is_cpu_label:
            sensor['recommended'] = True
            cpu_sensors.append(sensor)
        else:
            sensor['recommended'] = False
            other_sensors.append(sensor)
    
    # Return CPU sensors first, then others
    return cpu_sensors + other_sensors


def auto_detect_cpu_sensor() -> Optional[str]:
    """
    Automatically detect the best CPU temperature sensor.
    Returns path to the sensor or None.
    """
    sensors = get_cpu_sensors()
    
    # Prefer coretemp Package id 0 (Intel)
    for s in sensors:
        if s['name'] == 'coretemp' and 'package' in s['label'].lower():
            return s['path']
    
    # Prefer k10temp Tctl/Tdie (AMD)
    for s in sensors:
        if s['name'] == 'k10temp' and ('tctl' in s['label'].lower() or 'tdie' in s['label'].lower()):
            return s['path']
    
    # Prefer zenpower
    for s in sensors:
        if 'zenpower' in s['name']:
            return s['path']
    
    # Fallback to first recommended sensor
    for s in sensors:
        if s.get('recommended'):
            return s['path']
    
    # Fallback to first sensor
    if sensors:
        return sensors[0]['path']
    
    return None


def read_temp(path: str) -> float:
    """Read temperature from a sensor path."""
    try:
        with open(path, 'r') as f:
            return int(f.read().strip()) / 1000.0
    except:
        return 0.0


def scan_all() -> Dict:
    """
    Complete scan of temperature sensors.
    
    Returns:
    {
        'sensors': [...],
        'recommended': '/sys/class/hwmon/hwmon2/temp1_input',
        'summary': {
            'total': 10,
            'cpu_sensors': 4
        }
    }
    """
    sensors = get_cpu_sensors()
    recommended = auto_detect_cpu_sensor()
    
    cpu_count = sum(1 for s in sensors if s.get('recommended'))
    
    return {
        'sensors': sensors,
        'recommended': recommended,
        'summary': {
            'total': len(sensors),
            'cpu_sensors': cpu_count
        }
    }
