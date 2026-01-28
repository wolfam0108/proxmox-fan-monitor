"""
Sensor Manager Module

Unified sensor management for all temperature sources:
- hwmon (CPU, motherboard, chipset, etc.)
- nvidia (GPU temperature via nvidia-smi)
- drives (HDD/SSD/NVMe via smartctl)

Each sensor entity can have multiple physical sensors, 
the maximum value is used for thresholds.
"""
import subprocess
import json
import glob
import os
from typing import List, Dict, Optional, Any


# Sensor visual presets
VISUAL_PRESETS = {
    'system': {'icon': '🖥️', 'color': 'cyan'},
    'accelerator': {'icon': '🎮', 'color': 'green'},
    'storage': {'icon': '💾', 'color': 'orange'}
}


def format_size(size_bytes: int) -> str:
    """Format bytes to GB/TB."""
    if size_bytes >= 1000**4:
        return f"{size_bytes / (1000**4):.1f} TB"
    elif size_bytes >= 1024**4: # TiB check
        return f"{size_bytes / (1024**4):.1f} TiB"
    elif size_bytes >= 1000**3:
        return f"{size_bytes / (1000**3):.1f} GB"
    else:
        return f"{size_bytes / (1024**3):.1f} GiB"


def get_drive_details(device_path: str) -> Dict:
    """Get detailed drive info via smartctl."""
    try:
        # Use -a to get all info, -j for JSON
        # smartctl returns bitmask exit codes (e.g. 64), so check_output might fail
        # but stdout will still contain the JSON.
        try:
            o = subprocess.check_output(
                ['smartctl', '-j', '-a', device_path],
                stderr=subprocess.DEVNULL, timeout=5
            )
        except subprocess.CalledProcessError as e:
            o = e.output
            
        j = json.loads(o)
        
        # 1. Info / Model / Serial
        model = j.get('model_name', '')
        serial = j.get('serial_number', '')
        
        # Check SCSI/SAS specific fields
        if not model:
            vendor = j.get('scsi_vendor', '')
            product = j.get('scsi_product', '')
            if vendor or product:
                model = f"{vendor} {product}".strip()
            else:
                model = j.get('scsi_model_name', '')
                
        # 2. Capacity
        size_str = ''
        user_cap = j.get('user_capacity', {})
        if 'bytes' in user_cap:
            size_str = format_size(user_cap['bytes'])
            
        # 3. Form Factor
        ff = j.get('form_factor', {}).get('name', '')
        
        # 4. Interface / Type
        interface = ''
        dev_type = 'HDD' # Default
        
        rotation = j.get('rotation_rate', 1)
        if rotation == 0:
            dev_type = 'SSD'
            
        # NVMe detection
        if j.get('device', {}).get('protocol') == 'NVMe':
            interface = 'NVMe'
            dev_type = 'SSD'
            # Try to get PCIe info if available (often not in smartctl basic output without extra flags, but let's check basic)
        elif j.get('scsi_transport_protocol', {}).get('name'):
             interface = j['scsi_transport_protocol']['name'] # e.g. SAS
        elif j.get('interface_speed', {}).get('current', {}).get('string'):
             interface = j['interface_speed']['current']['string']
             
        # 5. Temperature
        temp = j.get('temperature', {}).get('current')
        if temp is None:
            # ATA Attribute 194 or 190
            for a in j.get('ata_smart_attributes', {}).get('table', []):
                if a['id'] in [194, 190]:
                    temp = a['raw']['value'] & 0xFF
                    break
        
        return {
            'model': model,
            'serial': serial,
            'size': size_str,
            'form_factor': ff,
            'interface': interface,
            'type': dev_type,
            'temp': temp
        }
    except:
        return {}


def scan_all_sources() -> Dict[str, List[Dict]]:
    """
    Scan all available temperature sources.
    
    Returns:
    {
        'hwmon': [...],
        'nvidia': [...],
        'drives': [...]
    }
    """
    return {
        'hwmon': scan_hwmon_sensors(),
        'nvidia': scan_nvidia_sensors(),
        'drives': scan_drive_sensors()
    }


def scan_hwmon_sensors() -> List[Dict]:
    """Scan all hwmon temperature sensors."""
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
                'source': 'hwmon',
                'path': temp_input,
                'hwmon': hwmon_name,
                'chip': name,
                'label': label or f'{name} {temp_id}',
                'value': round(value, 1),
                'suggested_preset': 'system'
            })
    
    return sensors


def scan_nvidia_sensors() -> List[Dict]:
    """Scan NVIDIA GPU temperature sensors."""
    sensors = []
    
    try:
        out = subprocess.check_output(
            ['nvidia-smi', '--query-gpu=index,name,temperature.gpu', '--format=csv,noheader'],
            stderr=subprocess.DEVNULL
        ).decode().strip()
        
        for line in out.split('\n'):
            if line.strip():
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 3:
                    gpu_index = int(parts[0])
                    gpu_name = parts[1]
                    temp = int(parts[2])
                    
                    sensors.append({
                        'source': 'nvidia',
                        'gpu_index': gpu_index,
                        'label': gpu_name,
                        'value': temp,
                        'suggested_preset': 'accelerator'
                    })
    except:
        pass
    
    return sensors


def scan_drive_sensors() -> List[Dict]:
    """Scan drive temperature sensors via smartctl."""
    sensors = []
    
    # Find all block devices
    try:
        lsblk = subprocess.check_output(
            ['lsblk', '-d', '-n', '-o', 'NAME,TYPE'],
            stderr=subprocess.DEVNULL
        ).decode().strip()
        
        for line in lsblk.split('\n'):
            parts = line.split()
            if len(parts) >= 2:
                name = parts[0]
                dev_type = parts[1]
                
                if dev_type != 'disk':
                    continue
                
                device_path = f'/dev/{name}'
                
                # Get details via smartctl helper
                details = get_drive_details(device_path)
                
                if details and details.get('temp') is not None:
                    sensors.append({
                        'source': 'drive',
                        'device': device_path,
                        'serial': details['serial'],
                        'label': details['model'] or name,
                        'value': details['temp'],
                        'details': details, # Include full details
                        'suggested_preset': 'storage'
                    })
    except:
        pass
    
    return sensors


def read_sensor_data(sensor_config: Dict) -> Dict:
    """
    Read detailed data from a configured sensor.
    Returns:
    {
        'value': float (max temp),
        'sources': [
            {
                'label': str,
                'value': float,
                'details': dict (optional extra info like drive model)
            }
        ]
    }
    """
    source = sensor_config.get('type', 'hwmon')
    result = {'value': None, 'sources': []}
    sources_data = []
    
    if source == 'hwmon':
        paths = sensor_config.get('paths', [])
        for path in paths:
            try:
                # Try to get label
                label_path = path.replace('_input', '_label')
                label = os.path.basename(path)
                if os.path.exists(label_path):
                    with open(label_path, 'r') as f:
                        label = f.read().strip()
                
                # Try to get chip name
                chip_name = ''
                hwmon_dir = os.path.dirname(path)
                name_path = os.path.join(hwmon_dir, 'name')
                if os.path.exists(name_path):
                     with open(name_path, 'r') as f:
                        chip_name = f.read().strip()

                with open(path, 'r') as f:
                    val = int(f.read().strip()) / 1000.0
                    sources_data.append({
                        'label': label,
                        'value': val,
                        'chip': chip_name,
                        'hwmon': os.path.basename(hwmon_dir),
                        'type': 'hwmon'
                    })
            except:
                pass
                
    elif source == 'nvidia':
        gpu_index = sensor_config.get('gpu_index', 0)
        try:
            # We can use cached info from config if we want to show model name without queyring every time
            # For now query simply
            out = subprocess.check_output(
                ['nvidia-smi', '-i', str(gpu_index), '--query-gpu=name,temperature.gpu,pci.bus_id', '--format=csv,noheader'],
                stderr=subprocess.DEVNULL
            ).decode().strip()
            parts = out.split(',')
            if len(parts) >= 2:
                name = parts[0].strip()
                val = float(parts[1].strip())
                bus_id = parts[2].strip() if len(parts) > 2 else ''
                
                sources_data.append({
                    'label': name,
                    'value': val,
                    'bus_id': bus_id,
                    'type': 'nvidia'
                })
        except:
            pass

    elif source == 'drive':
        devices = sensor_config.get('devices', [])
        cached_info = sensor_config.get('cached_info', {})
        
        for device in devices:
            try:
                # Try to get fresh data
                details = get_drive_details(device)
                val = details.get('temp')
                
                # Fallback to cached info if detailed scan fails
                if val is not None:
                    display_details = details
                elif device in cached_info:
                    display_details = cached_info[device]
                else:
                    continue

                sources_data.append({
                    'label': display_details.get('model', 'Unknown'),
                    'value': val,
                    'details': display_details,
                    'type': 'drive',
                    'device': device
                })
            except:
                pass

    if sources_data:
        valid_values = [s['value'] for s in sources_data if s['value'] is not None]
        max_val = max(valid_values) if valid_values else None
        result['value'] = max_val
        result['sources'] = sources_data
        
    return result


def read_sensor_value(sensor_config: Dict) -> Optional[float]:
    """Legacy wrapper for backward compatibility."""
    res = read_sensor_data(sensor_config)
    return res['value']


def get_all_sensor_values(sensors_config: List[Dict]) -> Dict[str, Any]:
    """
    Read values for all configured sensors.
    
    Returns: {sensor_id: {value: float, sources: [...]}}
    NOTE: Changed return type signature implying it now returns full objects, 
    but for safety calling it 'values' might be misleading. 
    However, existing code expects a Dict.
    Since we are upgrading the system, we will modify the caller (main loop) 
    to handle the new structure.
    """
    result = {}
    for sensor in sensors_config:
        sensor_id = sensor.get('id')
        if sensor_id:
            result[sensor_id] = read_sensor_data(sensor)
    return result


def create_sensor(
    sensor_id: str,
    name: str,
    sensor_type: str,
    visual_preset: str = 'system',
    paths: Optional[List[str]] = None,
    gpu_index: Optional[int] = None,
    devices: Optional[List[str]] = None
) -> Dict:
    """Create a new sensor configuration."""
    sensor = {
        'id': sensor_id,
        'name': name,
        'type': sensor_type,
        'visual_preset': visual_preset
    }
    
    if sensor_type == 'hwmon' and paths:
        sensor['paths'] = paths
    elif sensor_type == 'nvidia' and gpu_index is not None:
        sensor['gpu_index'] = gpu_index
    elif sensor_type == 'drive' and devices:
        sensor['devices'] = devices
    
    return sensor


def validate_sensor(sensor: Dict) -> bool:
    """Validate sensor configuration."""
    required = ['id', 'name', 'type']
    if not all(k in sensor for k in required):
        return False
    
    sensor_type = sensor.get('type')
    if sensor_type == 'hwmon':
        return bool(sensor.get('paths'))
    elif sensor_type == 'nvidia':
        return sensor.get('gpu_index') is not None
    elif sensor_type == 'drive':
        return bool(sensor.get('devices'))
    
    return False
