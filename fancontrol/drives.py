"""
Drive Scanning Module

Handles scanning all drives and returning configured drives for monitoring.
"""
import subprocess
import json


def scan_all_drives():
    """Scan all block devices and return their info with temperature"""
    drives = []
    
    try:
        lsblk_out = subprocess.check_output(
            ['lsblk', '-J', '-d', '-o', 'NAME,SIZE,MODEL,SERIAL,TRAN,ROTA'],
            stderr=subprocess.DEVNULL
        ).decode()
        lsblk_data = json.loads(lsblk_out)
        
        for dev in lsblk_data.get('blockdevices', []):
            name = dev.get('name', '')
            if not name or name.startswith('loop') or name.startswith('sr'):
                continue
            
            device_path = f'/dev/{name}'
            serial = dev.get('serial') or ''
            model = dev.get('model') or 'Unknown'
            size = dev.get('size') or 'Unknown'
            tran = dev.get('tran') or ''
            rota = dev.get('rota')
            
            if 'nvme' in name or tran == 'nvme':
                drive_type = 'NVMe'
            elif rota is False or rota == '0':
                drive_type = 'SSD'
            else:
                drive_type = 'HDD'
            
            if not serial:
                try:
                    smart_out = subprocess.check_output(
                        ['smartctl', '-j', '-i', device_path],
                        stderr=subprocess.DEVNULL, timeout=5
                    ).decode()
                    smart_data = json.loads(smart_out)
                    serial = smart_data.get('serial_number', '')
                except:
                    pass
            
            temperature = None
            try:
                smart_out = subprocess.check_output(
                    ['smartctl', '-j', '-A', device_path],
                    stderr=subprocess.DEVNULL, timeout=5
                ).decode()
                smart_data = json.loads(smart_out)
                
                temperature = smart_data.get('temperature', {}).get('current')
                
                if temperature is None:
                    for attr in smart_data.get('ata_smart_attributes', {}).get('table', []):
                        if attr.get('id') == 194:
                            temperature = attr.get('raw', {}).get('value', 0) & 0xFF
                            break
                
                if temperature is None and 'nvme_smart_health_information_log' in smart_data:
                    temperature = smart_data['nvme_smart_health_information_log'].get('temperature')
            except:
                pass
            
            drives.append({
                'serial': serial,
                'device': device_path,
                'model': model.strip() if model else 'Unknown',
                'size': size,
                'type': drive_type,
                'temperature': temperature
            })
    except Exception as e:
        print(f"Error scanning drives: {e}")
    
    return drives


def get_configured_drives(current_config):
    """Get list of drives that are configured for monitoring"""
    if not current_config:
        return []
    
    monitored_serials = current_config.get('drives', {}).get('monitored', [])
    
    if not monitored_serials:
        return []
    
    all_drives = scan_all_drives()
    configured = []
    
    for serial in monitored_serials:
        for drive in all_drives:
            if drive['serial'] == serial:
                configured.append(drive)
                break
    
    return configured
