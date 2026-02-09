#!/usr/bin/env python3
import time
import sys
import os
import subprocess

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fancontrol import gpu_scanner

def get_gpu_fan_state(gpu_index=0, fan_index=0):
    try:
        res = gpu_scanner.get_gpu_fan_speeds(gpu_index, ':0', [fan_index])
        return res.get(fan_index, {})
    except Exception as e:
        print(f"Error reading state: {e}")
        return {}

def set_fan_speed(gpu_index, fan_index, pct):
    print(f"Setting Fan {fan_index} on GPU {gpu_index} to {pct}%")
    try:
        # Enable manual
        subprocess.run(['nvidia-settings', '-c', ':0', '-a', f'[gpu:{gpu_index}]/GPUFanControlState=1'], 
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Set speed
        subprocess.run(['nvidia-settings', '-c', ':0', '-a', f'[fan:{fan_index}]/GPUTargetFanSpeed={pct}'], 
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        print(f"Error setting speed: {e}")

def main():
    print("=== GPU Fan Debugger ===")
    
    gpus = gpu_scanner.scan_nvidia_gpus()
    if not gpus:
        print("No NVIDIA GPUs found.")
        return

    print(f"Found {len(gpus)} GPUs.")
    for gpu in gpus:
        print(f"GPU {gpu['index']}: {gpu['name']} ({gpu['fan_count']} fans)")
    
    gpu_idx = 0
    fan_idx = 0
    
    if len(gpus) > 0:
        gpu_idx = gpus[0]['index']
        if gpus[0]['fan_count'] > 0:
            fan_idx = 0
            
    print(f"\nTesting GPU {gpu_idx} Fan {fan_idx}")
    
    try:
        while True:
            current = get_gpu_fan_state(gpu_idx, fan_idx)
            print(f"\rCurrent: RPM={current.get('rpm', '?')} | Driver %={current.get('pct', '?')}", end="")
            
            cmd = input("\nEnter target % (0-100) or 'q' to quit: ")
            if cmd.lower() == 'q':
                break
            
            if cmd.isdigit():
                target = int(cmd)
                if 0 <= target <= 100:
                    set_fan_speed(gpu_idx, fan_idx, target)
                    print("Monitoring response for 5 seconds...")
                    for _ in range(5):
                        time.sleep(1)
                        current = get_gpu_fan_state(gpu_idx, fan_idx)
                        print(f"RPM={current.get('rpm', '?')} | Driver %={current.get('pct', '?')}")
                else:
                    print("Invalid range (0-100)")
            else:
                print("Invalid input")
                
    except KeyboardInterrupt:
        print("\nExiting...")
        
    print("\nResetting to Auto...")
    subprocess.run(['nvidia-settings', '-c', ':0', '-a', f'[gpu:{gpu_idx}]/GPUFanControlState=0'], 
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

if __name__ == "__main__":
    main()
