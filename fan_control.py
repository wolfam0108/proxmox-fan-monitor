#!/usr/bin/env python3
import time
import threading
import logging
import signal
import sys
import os
import json
import signal
import sys
import os

# Ensure script directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fancontrol import config, sensors, controllers, web, state_manager, sensor_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/var/log/fan-control.log')
    ]
)
logger = logging.getLogger('FanControl')

# Global run flag
RUNNING = True

def signal_handler(sig, frame):
    global RUNNING
    logger.info("Stopping fan control service...")
    RUNNING = False

def get_cpu_temp(cfg):
    """Get CPU temperature from configured path"""
    path = cfg.get('cpu_sensor_path')
    if not path:
        return 0
    try:
        with open(path, 'r') as f:
            return int(f.read().strip()) / 1000.0
    except:
        return 0

def get_max_temp_by_type(sensor_values, sensor_configs, s_type):
    """Get max temperature for a given sensor type"""
    temps = []
    for s in sensor_configs:
        if s.get('type') == s_type:
            val = sensor_values.get(s['id'])
            if val is not None:
                temps.append(val)
    return max(temps) if temps else 0

def main():
    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    logger.info("Starting Fan Control Service")
    
    # Start Web Server in background
    web_thread = threading.Thread(target=web.start_http_server, daemon=True)
    web_thread.start()
    logger.info("Web server started")
    
    # Initialize controllers and state managers per group
    state_managers = {}
    fan_controllers = {}
    
    # Main loop
    while RUNNING:
        try:
            # Reload config if needed (or just use current)
            # config.load_config() is called on import, but we might want to refresh dynamic overrides
            cfg = config.current_config
            if not cfg:
                time.sleep(1)
                continue
            
            # 1. Read all sensors
            configured_sensors = cfg.get('sensors', [])
            # sensor_values is now {id: {'value': float, 'sources': [...]}}
            sensor_data_map = sensor_manager.get_all_sensor_values(configured_sensors)
            
            # Helper to extract simpler value map for logic
            simple_sensor_values = {k: v['value'] for k, v in sensor_data_map.items() if v['value'] is not None}
            
            # Determine logic inputs
            cpu_temp = get_cpu_temp(cfg)
            gpu_temp = get_max_temp_by_type(simple_sensor_values, configured_sensors, 'nvidia')
            hdd_temp = get_max_temp_by_type(simple_sensor_values, configured_sensors, 'drive')
            
            # Initialize API data structure
            api_data = {
                'timestamp': time.time(),
                'temps': {
                    'cpu': cpu_temp,
                    'gpu': gpu_temp,
                    'hddMax': hdd_temp,
                    'hddList': [] # Populate if needed, or leave empty if using new sensors
                },
                'sensors': [],
                'logic': {},
                'fans': []
            }

            # Populate sensors list dynamically
            for sensor_id, data in sensor_data_map.items():
                # Find config for this sensor
                conf = next((s for s in configured_sensors if s['id'] == sensor_id), {})
                api_data['sensors'].append({
                    'id': sensor_id,
                    'name': conf.get('name', sensor_id),
                    'type': conf.get('type', 'hwmon'),
                    'visual_preset': conf.get('visual_preset', 'system'),
                    'value': data['value'],
                    'sources': data['sources']
                })

            # 2. Iterate Fan Groups
            fan_groups = cfg.get('fan_groups', [])
            for group in fan_groups:
                gid = group['id']
                
                # Check runtime override
                override = config.runtime_override.get(gid, {'enabled': False, 'mode': '0'})
                
                # Init State Manager if needed
                if gid not in state_managers:
                    legacy_cfg = config.profiles_to_legacy_format(group)
                    state_managers[gid] = state_manager.AutoStateManager(legacy_cfg)
                
                # Update State Manager
                sm = state_managers[gid]
                # Update config in case it changed
                sm.config = config.profiles_to_legacy_format(group)
                sm.mode_keys = sorted(sm.config['THRESHOLDS'].keys(), key=lambda x: int(x), reverse=True)
                
                if override['enabled']:
                    current_mode = str(override['mode'])
                    sm.current_mode = current_mode
                    sm.status_msg = "MANUAL"
                else:
                    # Prepare all sensor values for logic
                    # 1. Start with dedicated sensor values
                    logic_values = simple_sensor_values.copy()
                    # 2. Add legacy aggregate values for backward compatibility
                    logic_values['cpu'] = cpu_temp
                    logic_values['gpu'] = gpu_temp
                    logic_values['hdd'] = hdd_temp
                    
                    current_mode = sm.update(logic_values)
                
                # Find target from profile using mode index
                target = 0
                if group.get('profiles') and str(current_mode).isdigit():
                    idx = int(current_mode)
                    if 0 <= idx < len(group['profiles']):
                        target = group['profiles'][idx]['target']
                
                api_data['logic'][gid] = {
                    'mode': current_mode,
                    'target': target,
                    'status': sm.status_msg,
                    'isManual': override['enabled'],
                    'groupName': group.get('name', gid)
                }

                # Apply to fans
                fans_list = group.get('fans', [])
                
                # Compatibility: Synthesize legacy GPU group fans if empty list but type is nvidia
                if group.get('type') == 'nvidia' and not fans_list:
                    gpu_cfg = group.get('gpu_config', {})
                    fan_indices = gpu_cfg.get('fans', [0, 1])
                    fans_list = []
                    for idx in fan_indices:
                        fans_list.append({
                            'fan_id': f"{gid}_fan_{idx}",
                            'name': f"GPU Fan {idx}",
                            'type': 'nvidia',
                            'gpu_index': gpu_cfg.get('gpu_index', 0),
                            'fan_index': idx,
                            'display': gpu_cfg.get('display', ':0')
                        })

                for fan_map in fans_list:
                    fid = fan_map['fan_id']
                    fan_type = fan_map.get('type', 'system')
                    
                    fan_data = {
                        'id': fid,
                        'name': fan_map['name'],
                        'groupId': gid,
                        'rpm': 0,
                        'target': target,
                        'pwmOrPct': 0,
                        'status': 'OK',
                        'type': 'SYS' if fan_type == 'system' else 'GPU'
                    }

                    if fan_type == 'nvidia':
                        # GPU Controller
                        if fid not in fan_controllers:
                            # Create controller for specific fan index
                            g_cfg = {
                                'gpu_index': fan_map.get('gpu_index', 0),
                                'fans': [fan_map.get('fan_index', 0)],
                                'display': fan_map.get('display', ':0')
                            }
                            fan_controllers[fid] = controllers.GPUFanController(g_cfg)
                        
                        ctrl = fan_controllers[fid]
                        
                        # Determine Target
                        if target > 100:
                            # RPM Target - Closed Loop
                            ctrl.set_target_rpm(target)
                            ctrl.update()
                            
                            current_rpm = ctrl.current_rpm
                            fan_data['rpm'] = current_rpm
                            fan_data['pwmOrPct'] = ctrl.current_pct
                            
                            # Status check (User requested +/- 50 tolerance)
                            if abs(target - current_rpm) > 50:
                                fan_data['status'] = 'ADJ'
                            else:
                                fan_data['status'] = 'OK'
                                
                        else:
                            # Percentage Target - Open Loop
                            pct = min(100, int(target))
                            ctrl.set_target_rpm(0) # Disable closed loop
                            ctrl.set_speed_pct(pct)
                            
                            fan_data['rpm'] = ctrl.get_rpm()
                            fan_data['pwmOrPct'] = pct
                            fan_data['status'] = 'OK'
                        
                    else:
                        # System Fan Controller
                        if fid not in fan_controllers:
                            fan_controllers[fid] = controllers.SystemFanController(
                                fan_map['name'],
                                fan_map.get('pwm_path'),
                                fan_map.get('fan_input')
                            )
                        
                        ctrl = fan_controllers[fid]
                        
                        # Set Target RPM
                        # If target is small (<100), it might be %, convert to RPM?
                        # System profiles usually use RPM (800+).
                        # If user sets 50 (%), we need to map to RPM?
                        if target <= 100 and target > 0:
                             # Map % to RPM range (e.g. 500-2000)
                             # 0% = 0, 1% = 500, 100% = 2000
                             ctrl.target_rpm = int(500 + (target/100.0 * 1500))
                        else:
                             ctrl.target_rpm = target
                             
                        ctrl.update() # PID/Step logic
                        
                        fan_data['rpm'] = ctrl.current_rpm
                        fan_data['pwmOrPct'] = ctrl.current_pwm
                        
                        # Status check for System Fans
                        # Using 50 RPM tolerance to match UI expectations
                        if abs(ctrl.target_rpm - ctrl.current_rpm) > 50:
                            fan_data['status'] = 'ADJ'
                        else:
                            fan_data['status'] = 'OK'
                    
                    api_data['fans'].append(fan_data)

            # Update shared state for API
            with web.current_state['lock']:
                web.current_state['data'] = api_data

            # Log history
            try:
                web.history_logger.info(json.dumps(api_data))
            except:
                pass
            
            time.sleep(2)
            
        except Exception as e:
            logger.error(f"Error in main loop: {e}", exc_info=True)
            time.sleep(5)

if __name__ == "__main__":
    main()
