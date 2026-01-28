
import subprocess
import json
import sys

def format_size(size_bytes):
    try:
        size_bytes = int(size_bytes)
        if size_bytes >= 1000**4:
            return f"{size_bytes / (1000**4):.1f} TB"
        elif size_bytes >= 1000**3:
            return f"{size_bytes / (1000**3):.1f} GB"
        else:
            return f"{size_bytes / (1024**3):.1f} GiB"
    except:
        return "?"

def debug_scan():
    print("--- 1. Running lsblk ---")
    try:
        lsblk_out = subprocess.check_output(
            ['lsblk', '-d', '-n', '-o', 'NAME,TYPE,SIZE,MODEL,SERIAL'],
            stderr=subprocess.STDOUT
        ).decode()
        print(lsblk_out)
    except Exception as e:
        print(f"Error running lsblk: {e}")
        return

    print("\n--- 2. Parsing loop ---")
    lines = lsblk_out.strip().split('\n')
    found_count = 0
    
    for line in lines:
        parts = line.split()
        if len(parts) < 2:
            continue
            
        name = parts[0]
        dev_type = parts[1]
        device_path = f'/dev/{name}'
        
        print(f"Checking {device_path} (Type: {dev_type})... ", end='')
        
        if dev_type != 'disk':
            print("SKIPPED (Not a disk)")
            continue
            
        try:
            cmd = ['smartctl', '-j', '-a', device_path]
            o = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=5)
            j = json.loads(o)
            
            # Check temp
            temp = j.get('temperature', {}).get('current')
            if temp is None:
                 for a in j.get('ata_smart_attributes', {}).get('table', []):
                    if a['id'] in [194, 190]:
                        temp = a['raw']['value'] & 0xFF
                        break
            
            if temp is not None:
                print(f"OK (Temp: {temp}°C)")
                found_count += 1
            else:
                print("SKIPPED (No temperature found)")
                # Dump keys to see what's wrong
                # print(f"Keys: {list(j.keys())}")
                
        except Exception as e:
            print(f"FAILED ({e})")
            
    print(f"\nTotal found with temperature: {found_count}")

if __name__ == '__main__':
    debug_scan()
