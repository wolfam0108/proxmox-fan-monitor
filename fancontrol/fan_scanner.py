"""
Fan Scanner Module

Scans hwmon devices for fans and PWM controllers.
Provides functions for discovering and testing fan hardware.
"""
import os
import glob
from pathlib import Path
from typing import List, Dict, Optional
from . import gpu_scanner
from . import driver_check


def scan_hwmon_devices() -> List[Dict]:
    """
    Scan all hwmon devices in the system.
    
    Returns list of:
    {
        "path": "/sys/class/hwmon/hwmon3",
        "name": "it8613",
        "fans": [...],
        "pwms": [...]
    }
    """
    devices = []
    
    for hwmon_path in sorted(glob.glob('/sys/class/hwmon/hwmon*')):
        try:
            name_file = os.path.join(hwmon_path, 'name')
            if os.path.exists(name_file):
                with open(name_file, 'r') as f:
                    chip_name = f.read().strip()
            else:
                chip_name = os.path.basename(hwmon_path)
            
            # Find fans and PWMs for this device
            fans = scan_fans_in_hwmon(hwmon_path)
            pwms = scan_pwms_in_hwmon(hwmon_path)
            
            # Only include devices that have fans or PWMs
            if fans or pwms:
                devices.append({
                    'path': hwmon_path,
                    'name': chip_name,
                    'fans': fans,
                    'pwms': pwms
                })
        except Exception as e:
            print(f"Error scanning {hwmon_path}: {e}")
    
    return devices


def scan_fans_in_hwmon(hwmon_path: str) -> List[Dict]:
    """
    Scan for fan inputs in a hwmon device.
    
    Returns list of:
    {
        "id": "fan2",
        "input_path": "/sys/class/hwmon/hwmon3/fan2_input",
        "rpm": 1150,
        "label": "Chassis Fan" (optional)
    }
    """
    fans = []
    
    for fan_input in sorted(glob.glob(os.path.join(hwmon_path, 'fan*_input'))):
        try:
            # Extract fan ID (e.g., "fan2" from "fan2_input")
            basename = os.path.basename(fan_input)
            fan_id = basename.replace('_input', '')
            
            # Read current RPM
            with open(fan_input, 'r') as f:
                rpm = int(f.read().strip())
            
            fan_info = {
                'id': fan_id,
                'input_path': fan_input,
                'rpm': rpm
            }
            
            # Try to read label if exists
            label_path = os.path.join(hwmon_path, f'{fan_id}_label')
            if os.path.exists(label_path):
                try:
                    with open(label_path, 'r') as f:
                        fan_info['label'] = f.read().strip()
                except:
                    pass
            
            fans.append(fan_info)
        except Exception as e:
            print(f"Error reading {fan_input}: {e}")
    
    return fans


def scan_pwms_in_hwmon(hwmon_path: str) -> List[Dict]:
    """
    Scan for PWM controllers in a hwmon device.
    
    Returns list of:
    {
        "id": "pwm2",
        "path": "/sys/class/hwmon/hwmon3/pwm2",
        "enable_path": "/sys/class/hwmon/hwmon3/pwm2_enable",
        "value": 128,
        "enable": 1,
        "controllable": true
    }
    """
    pwms = []
    
    for pwm_path in sorted(glob.glob(os.path.join(hwmon_path, 'pwm[0-9]'))):
        try:
            # Extract PWM ID (e.g., "pwm2")
            pwm_id = os.path.basename(pwm_path)
            
            # Read current value
            with open(pwm_path, 'r') as f:
                value = int(f.read().strip())
            
            pwm_info = {
                'id': pwm_id,
                'path': pwm_path,
                'value': value,
                'controllable': os.access(pwm_path, os.W_OK)
            }
            
            # Check enable file
            enable_path = pwm_path + '_enable'
            if os.path.exists(enable_path):
                pwm_info['enable_path'] = enable_path
                try:
                    with open(enable_path, 'r') as f:
                        pwm_info['enable'] = int(f.read().strip())
                except:
                    pwm_info['enable'] = None
            
            pwms.append(pwm_info)
        except Exception as e:
            print(f"Error reading {pwm_path}: {e}")
    
    return pwms


def get_fan_rpm(fan_input_path: str) -> int:
    """Read current RPM from a fan input path."""
    try:
        with open(fan_input_path, 'r') as f:
            return int(f.read().strip())
    except:
        return 0


def get_all_fans_rpm(devices: List[Dict] = None) -> Dict[str, int]:
    """
    Get current RPM for all fans.
    
    Returns: {"it8613/fan2": 1150, "it8613/fan3": 980, ...}
    Uses chip name (from device['name']) for consistency with scan_all().
    """
    if devices is None:
        devices = scan_hwmon_devices()
    
    result = {}
    for device in devices:
        chip_name = device['name']  # Use chip name, not hwmon path
        for fan in device['fans']:
            key = f"{chip_name}/{fan['id']}"
            result[key] = get_fan_rpm(fan['input_path'])
    
    return result


def set_pwm_value(pwm_path: str, value: int) -> bool:
    """
    Set PWM value (0-255).
    
    Returns True on success.
    """
    value = max(0, min(255, value))
    try:
        # First, try to enable manual control
        enable_path = pwm_path + '_enable'
        if os.path.exists(enable_path):
            try:
                with open(enable_path, 'w') as f:
                    f.write('1')  # 1 = manual control
            except:
                pass
        
        # Set the PWM value
        with open(pwm_path, 'w') as f:
            f.write(str(value))
        return True
    except Exception as e:
        print(f"Error setting PWM {pwm_path} to {value}: {e}")
        return False


def test_pwm(pwm_path: str, value: int, duration_ms: int = 2000) -> Dict:
    """
    Temporarily set PWM for testing.
    
    Note: This sets the value but doesn't restore it automatically.
    The caller should handle restoration if needed.
    
    Returns: {"success": bool, "previous_value": int}
    """
    try:
        # Read current value
        with open(pwm_path, 'r') as f:
            previous = int(f.read().strip())
        
        # Set new value
        success = set_pwm_value(pwm_path, value)
        
        return {
            'success': success,
            'previous_value': previous,
            'current_value': value
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def scan_all() -> Dict:
    """
    Complete scan of all fans and PWMs.
    
    Returns:
    {
        "devices": [...],
        "summary": {
            "total_fans": 4,
            "total_pwms": 3,
            "active_fans": 3  # RPM > 0
        }
    }
    """
    devices = scan_hwmon_devices()
    
    total_fans = 0
    total_pwms = 0
    active_fans = 0
    
    for device in devices:
        total_fans += len(device['fans'])
        total_pwms += len(device['pwms'])
        active_fans += sum(1 for f in device['fans'] if f['rpm'] > 0)
    
    return {
        'devices': devices,
        'summary': {
            'total_fans': total_fans,
            'total_pwms': total_pwms,
            'active_fans': active_fans
        }
    }


def scan_unified() -> Dict:
    """
    Unified scan for UI.
    Returns structure matching FanScanResult in frontend.
    """
    # 1. Scan System Fans
    system_devices = scan_hwmon_devices()
    
    # 2. Check NVIDIA Driver
    driver_avail, gpu_count = driver_check.check_nvidia_driver()
    driver_status = {
        'available': driver_avail,
        'gpu_count': gpu_count
    }
    
    # 3. Scan GPU Fans
    gpu_devices = []
    if driver_avail:
        gpu_devices = gpu_scanner.scan_nvidia_gpus()
        
    # 4. Flatten into AllocatableFan list
    all_fans = []
    
    # Process System Fans
    for device in system_devices:
        chip_name = device['name']
        pwms = device['pwms'] # Pass available PWMs to fan for UI filtering
        
        for fan in device['fans']:
            # Create unique ID: "chip/fanID"
            unique_id = f"{chip_name}/{fan['id']}"
            
            allocatable_fan = {
                'id': unique_id,
                'name': fan.get('label') or f"{chip_name} {fan['id']}",
                'type': 'system',
                'rpm': fan['rpm'],
                'input_path': fan['input_path'],
                'chip': chip_name,
                'available_pwms': pwms
            }
            all_fans.append(allocatable_fan)
            
    # Process GPU Fans
    for gpu in gpu_devices:
        gpu_idx = gpu['index']
        gpu_name = gpu['name']
        
        for fan_idx in gpu['fans']: # List of indices [0, 1...]
            unique_id = f"gpu{gpu_idx}_fan{fan_idx}"
            
            # Fetch specific fan RPM if not already in gpu object (gpu object has temp but maybe not individual fan RPMs easily? 
            # scan_nvidia_gpus returns 'fans': [0, 1], 'fan_count': 2. It doesn't put RPM in there yet.
            # We can fetch RPMs in batch or individually.
            # Let's use get_gpu_fan_speeds to be safe/accurate.
            # Or reliance on gpu_scanner implementation?
            # gpu_scanner.scan_nvidia_gpus() does NOT return RPMs in the list items (only temp).
            
            # Fetch RPM
            rpm = 0
            try:
                speeds = gpu_scanner.get_gpu_fan_speeds(gpu_idx, gpu.get('display', ':0'), [fan_idx])
                rpm = speeds.get(fan_idx, {}).get('rpm', 0)
            except:
                pass
                
            allocatable_fan = {
                'id': unique_id,
                'name': f"{gpu_name} Fan {fan_idx}",
                'type': 'nvidia',
                'rpm': rpm,
                'gpu_index': gpu_idx,
                'fan_index': fan_idx,
                'uuid': gpu['uuid'],
                'display': gpu.get('display', ':0')
            }
            all_fans.append(allocatable_fan)
            
    return {
        'success': True,
        'fans': all_fans,
        'system_devices': system_devices,
        'driver_status': driver_status
    }
