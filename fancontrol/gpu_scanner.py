"""
GPU Scanner Module

Scans for NVIDIA GPUs and their fans using nvidia-smi and nvidia-settings.
Provides functions for discovering GPU hardware configuration.
"""
import subprocess
import re
from typing import List, Dict, Optional


def detect_display() -> str:
    """
    Detect the X display to use for nvidia-settings.
    Returns ':0' by default, or attempts to find active display.
    """
    # Try common displays
    for display in [':0', ':1', ':2']:
        try:
            result = subprocess.run(
                ['nvidia-settings', '-c', display, '-q', 'GPUCoreTemp'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=3
            )
            if result.returncode == 0:
                return display
        except:
            continue
    return ':0'


def get_gpu_count() -> int:
    """Get the number of NVIDIA GPUs in the system."""
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=count', '--format=csv,noheader'],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=5
        )
        if result.returncode == 0:
            lines = result.stdout.decode().strip().split('\n')
            return len(lines)
    except:
        pass
    return 0


def get_fan_count(gpu_index: int = 0, display: str = ':0') -> int:
    """
    Get the number of fans for a specific GPU.
    Tries querying fans until one fails.
    """
    fan_count = 0
    for i in range(10):  # Max 10 fans per GPU
        try:
            result = subprocess.run(
                ['nvidia-settings', '-c', display, '-t', 
                 '-q', f'[fan:{i}]/GPUCurrentFanSpeedRPM'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=3
            )
            if result.returncode == 0 and result.stdout.decode().strip().isdigit():
                fan_count += 1
            else:
                break
        except:
            break
    return fan_count


def scan_nvidia_gpus() -> List[Dict]:
    """
    Scan all NVIDIA GPUs in the system.
    
    Returns list of:
    {
        'index': 0,
        'name': 'NVIDIA GeForce RTX 3080',
        'uuid': 'GPU-...',
        'fans': [0, 1],  # Fan indices
        'fan_count': 2,
        'temperature': 45
    }
    """
    gpus = []
    display = detect_display()
    
    try:
        # Query GPU list
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=index,name,uuid,temperature.gpu',
             '--format=csv,noheader,nounits'],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=5
        )
        
        if result.returncode != 0:
            return []
        
        lines = result.stdout.decode().strip().split('\n')
        for line in lines:
            if not line.strip():
                continue
            
            parts = [p.strip() for p in line.split(',')]
            if len(parts) < 4:
                continue
            
            gpu_index = int(parts[0])
            gpu_name = parts[1]
            gpu_uuid = parts[2]
            gpu_temp = int(parts[3]) if parts[3].isdigit() else 0
            
            # Get fan count for this GPU
            fan_count = get_fan_count(gpu_index, display)
            fan_indices = list(range(fan_count))
            
            gpus.append({
                'index': gpu_index,
                'name': gpu_name,
                'uuid': gpu_uuid,
                'fans': fan_indices,
                'fan_count': fan_count,
                'temperature': gpu_temp,
                'display': display
            })
    except Exception as e:
        print(f"Error scanning GPUs: {e}")
    
    return gpus


def get_gpu_fan_speeds(gpu_index: int = 0, display: str = ':0', 
                        fan_indices: List[int] = None) -> Dict[int, Dict]:
    """
    Get current fan speeds for a GPU.
    
    Returns: {fan_index: {'rpm': int, 'pct': int}}
    """
    if fan_indices is None:
        fan_indices = [0, 1]
    
    result = {}
    for fan_idx in fan_indices:
        try:
            cmd = [
                'nvidia-settings', '-c', display, '-t',
                '-q', f'[fan:{fan_idx}]/GPUCurrentFanSpeedRPM',
                '-q', f'[fan:{fan_idx}]/GPUCurrentFanSpeed'
            ]
            out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=3)
            lines = out.decode().strip().split('\n')
            
            rpm = int(lines[0]) if len(lines) > 0 and lines[0].strip().isdigit() else 0
            pct = int(lines[1]) if len(lines) > 1 and lines[1].strip().isdigit() else 0
            
            result[fan_idx] = {'rpm': rpm, 'pct': pct}
        except:
            result[fan_idx] = {'rpm': 0, 'pct': 0}
    
    return result


def test_gpu_fan(fan_index: int, target_pct: int, 
                 gpu_index: int = 0, display: str = ':0') -> Dict:
    """
    Test setting a GPU fan to a specific speed.
    Returns result with success status and previous/current values.
    """
    try:
        # Get current state
        current = get_gpu_fan_speeds(gpu_index, display, [fan_index])
        prev_pct = current.get(fan_index, {}).get('pct', 0)
        
        # Enable manual control
        subprocess.run(
            ['nvidia-settings', '-c', display, '-a',
             f'[gpu:{gpu_index}]/GPUFanControlState=1'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3
        )
        
        # Set fan speed
        subprocess.run(
            ['nvidia-settings', '-c', display, '-a',
             f'[fan:{fan_index}]/GPUTargetFanSpeed={target_pct}'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3
        )
        
        return {
            'success': True,
            'previous_pct': prev_pct,
            'target_pct': target_pct,
            'fan_index': fan_index
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def reset_gpu_fans(gpu_index: int = 0, display: str = ':0') -> bool:
    """Reset GPU fans to automatic control."""
    try:
        subprocess.run(
            ['nvidia-settings', '-c', display, '-a',
             f'[gpu:{gpu_index}]/GPUFanControlState=0'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3
        )
        return True
    except:
        return False


def scan_all() -> Dict:
    """
    Complete scan of all NVIDIA GPUs.
    
    Returns:
    {
        'gpus': [...],
        'display': ':0',
        'summary': {
            'total_gpus': 1,
            'total_fans': 2
        }
    }
    """
    display = detect_display()
    gpus = scan_nvidia_gpus()
    
    total_fans = sum(gpu['fan_count'] for gpu in gpus)
    
    return {
        'gpus': gpus,
        'display': display,
        'summary': {
            'total_gpus': len(gpus),
            'total_fans': total_fans
        }
    }
