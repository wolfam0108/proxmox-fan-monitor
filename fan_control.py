#!/usr/bin/env python3
import os
import sys
import time
import glob
import subprocess
import re
import json
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from logging.handlers import RotatingFileHandler
import logging

# --- CONFIGURATION START ---

# System Fans (Fan2/Fan3)
SYS_CONFIG = {
    'NAME': 'System',
    'TARGETS': {
        '1': 1200,  # Quiet
        '2': 1600,  # Standard
        '3': 2000   # Critical
    },
    'THRESHOLDS': {
        # (CPU, GPU, HDD)
        '3': (62, 82, 48),
        '2': (57, 76, 41)
    },
    'DELAY_UP': 5,      # Seconds before upgrading mode
    'HOLD_TIME': {
        '3': 60,
        '2': 40
    }
}

# GPU Fans (Fan0/Fan1)
GPU_CONFIG = {
    'NAME': 'GPU',
    'TARGETS': {
        '0': 0,    # Auto/Silent
        '1': 45,   # > 60C
        '2': 50,   # > 70C
        '3': 60,   # > 75C
        '4': 100   # > 82C
    },
    'THRESHOLDS': {
        # Only GPU Temp matters here, others ignored (-999)
        # Format: (CPU, GPU, HDD) - though we only check GPU in logic usually,
        # but to keep generic logic simple, we can map GPU temp to the 2nd slot.
        '4': (999, 82, 999), 
        '3': (999, 75, 999),
        '2': (999, 70, 999),
        '1': (999, 60, 999)
    },
    'DELAY_UP': 5,
    'HOLD_TIME': {
        '4': 30,
        '3': 30,
        '2': 30,
        '1': 30
    }
}

# --- CONFIGURATION END ---

# --- CONFIG FILE SUPPORT ---
CONFIG_FILE = Path(__file__).parent / 'fan_config.json'

# Runtime override state (not persisted across restarts unless saved)
runtime_override = {
    'system': {'enabled': False, 'mode': '1'},
    'gpu': {'enabled': False, 'mode': '0'}
}

DEFAULT_CONFIG = {
    'system': {
        'targets': {'1': 1200, '2': 1600, '3': 2000},
        'thresholds': {'3': [62, 82, 48], '2': [57, 76, 41]},
        'delay_up': 5,
        'hold_time': {'3': 60, '2': 40}
    },
    'gpu': {
        'targets': {'0': 0, '1': 45, '2': 50, '3': 60, '4': 100},
        'thresholds': {'4': [999, 82, 999], '3': [999, 75, 999], '2': [999, 70, 999], '1': [999, 60, 999]},
        'delay_up': 5,
        'hold_time': {'4': 30, '3': 30, '2': 30, '1': 30}
    },
    'override': {
        'system': {'enabled': False, 'mode': '1'},
        'gpu': {'enabled': False, 'mode': '0'}
    }
}

def load_config():
    """Load config from JSON file or use defaults"""
    global SYS_CONFIG, GPU_CONFIG, runtime_override
    
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r') as f:
                cfg = json.load(f)
            
            # Apply to SYS_CONFIG
            if 'system' in cfg:
                s = cfg['system']
                SYS_CONFIG['TARGETS'] = {k: int(v) for k, v in s.get('targets', {}).items()}
                SYS_CONFIG['THRESHOLDS'] = {k: tuple(v) for k, v in s.get('thresholds', {}).items()}
                SYS_CONFIG['DELAY_UP'] = s.get('delay_up', 5)
                SYS_CONFIG['HOLD_TIME'] = {k: int(v) for k, v in s.get('hold_time', {}).items()}
            
            # Apply to GPU_CONFIG
            if 'gpu' in cfg:
                g = cfg['gpu']
                GPU_CONFIG['TARGETS'] = {k: int(v) for k, v in g.get('targets', {}).items()}
                GPU_CONFIG['THRESHOLDS'] = {k: tuple(v) for k, v in g.get('thresholds', {}).items()}
                GPU_CONFIG['DELAY_UP'] = g.get('delay_up', 5)
                GPU_CONFIG['HOLD_TIME'] = {k: int(v) for k, v in g.get('hold_time', {}).items()}
            
            # Load override settings
            if 'override' in cfg:
                runtime_override['system'] = cfg['override'].get('system', {'enabled': False, 'mode': '1'})
                runtime_override['gpu'] = cfg['override'].get('gpu', {'enabled': False, 'mode': '0'})
            
            print(f"Config loaded from {CONFIG_FILE}")
        except Exception as e:
            print(f"Error loading config: {e}, using defaults")
    else:
        # Create default config file
        save_config()
        print(f"Created default config at {CONFIG_FILE}")

def save_config(config=None):
    """Save current config to JSON file"""
    if config is None:
        config = {
            'system': {
                'targets': SYS_CONFIG['TARGETS'],
                'thresholds': {k: list(v) for k, v in SYS_CONFIG['THRESHOLDS'].items()},
                'delay_up': SYS_CONFIG['DELAY_UP'],
                'hold_time': SYS_CONFIG['HOLD_TIME']
            },
            'gpu': {
                'targets': GPU_CONFIG['TARGETS'],
                'thresholds': {k: list(v) for k, v in GPU_CONFIG['THRESHOLDS'].items()},
                'delay_up': GPU_CONFIG['DELAY_UP'],
                'hold_time': GPU_CONFIG['HOLD_TIME']
            },
            'override': runtime_override
        }
    
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def get_current_config():
    """Get current config as dict for API"""
    return {
        'system': {
            'targets': SYS_CONFIG['TARGETS'],
            'thresholds': {k: list(v) for k, v in SYS_CONFIG['THRESHOLDS'].items()},
            'delay_up': SYS_CONFIG['DELAY_UP'],
            'hold_time': SYS_CONFIG['HOLD_TIME']
        },
        'gpu': {
            'targets': GPU_CONFIG['TARGETS'],
            'thresholds': {k: list(v) for k, v in GPU_CONFIG['THRESHOLDS'].items()},
            'delay_up': GPU_CONFIG['DELAY_UP'],
            'hold_time': GPU_CONFIG['HOLD_TIME']
        },
        'override': runtime_override
    }

# Load config at module import
load_config()

# --- WEB SERVER CONFIG ---
HTTP_PORT = 8080
STATIC_DIR = Path(__file__).parent / 'fancontrol-ui' / 'dist'
LOG_DIR = Path('/var/log/fan_control')
LOG_FILE = LOG_DIR / 'history.jsonl'
LOG_MAX_BYTES = 10 * 1024 * 1024  # 10MB
LOG_BACKUP_COUNT = 5
LOG_INTERVAL = 5  # seconds between log writes

# --- SETUP LOGGING ---
LOG_DIR.mkdir(parents=True, exist_ok=True)

history_logger = logging.getLogger('history')
history_logger.setLevel(logging.INFO)
handler = RotatingFileHandler(
    LOG_FILE, 
    maxBytes=LOG_MAX_BYTES, 
    backupCount=LOG_BACKUP_COUNT
)
handler.setFormatter(logging.Formatter('%(message)s'))
history_logger.addHandler(handler)

# --- SHARED STATE ---
current_state = {
    'data': None,
    'lock': threading.Lock()
}

def get_history_from_logs(limit=300):
    """Read last N entries from log files"""
    entries = []
    try:
        # Read current and rotated files
        log_files = sorted(LOG_DIR.glob('history.jsonl*'), reverse=True)
        for log_file in log_files:
            if len(entries) >= limit:
                break
            try:
                with open(log_file, 'r') as f:
                    lines = f.readlines()
                    for line in reversed(lines):
                        if len(entries) >= limit:
                            break
                        try:
                            entries.append(json.loads(line.strip()))
                        except:
                            pass
            except:
                pass
    except:
        pass
    entries.reverse()
    return entries[-limit:]

class FanControlHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)
    
    def log_message(self, format, *args):
        pass  # Suppress HTTP logs
    
    def parse_query(self):
        """Parse query string from path"""
        if '?' in self.path:
            path, query = self.path.split('?', 1)
            params = dict(p.split('=') for p in query.split('&') if '=' in p)
            return path, params
        return self.path, {}
    
    def do_GET(self):
        path, params = self.parse_query()
        
        if path == '/api/status':
            self.handle_status()
        elif path == '/api/history':
            self.handle_history(params)
        elif path == '/api/config':
            self.handle_get_config()
        else:
            # Serve static files or index.html for SPA
            if not Path(str(STATIC_DIR) + path).exists() and not path.startswith('/api/'):
                self.path = '/index.html'
            super().do_GET()
    
    def do_POST(self):
        path, _ = self.parse_query()
        
        if path == '/api/config':
            self.handle_post_config()
        elif path == '/api/restart':
            self.handle_restart()
        elif path == '/api/override':
            self.handle_override()
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()
    
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def handle_status(self):
        with current_state['lock']:
            data = current_state['data']
        
        if data is None:
            self.send_json({'error': 'Not ready'}, 503)
            return
        
        self.send_json(data)
    
    def handle_history(self, params):
        # Parse range parameter (in seconds)
        range_map = {'1m': 60, '5m': 300, '30m': 1800, '1h': 3600, '6h': 21600, '1d': 86400, '1w': 604800, '1mo': 2592000}
        range_key = params.get('range', '30m')
        range_seconds = range_map.get(range_key, 1800)
        
        # Calculate how many entries we need (1 entry per LOG_INTERVAL seconds)
        max_entries = min(range_seconds // LOG_INTERVAL + 10, 10000)
        
        entries = get_history_from_logs(max_entries)
        
        # Filter by time range
        now = time.time()
        cutoff_time = now - range_seconds
        
        # Convert to chart format with modes
        chart_data = []
        for e in entries:
            # Parse timestamp if available, otherwise include all
            ts = e.get('timestamp', 0)
            if ts and ts < cutoff_time:
                continue
            
            chart_data.append({
                'time': e.get('time', ''),
                'timestamp': ts,
                'cpu': e.get('temps', {}).get('cpu', 0),
                'gpu': e.get('temps', {}).get('gpu', 0),
                'hdd': e.get('temps', {}).get('hddMax', 0),
                'sysFanRpm': e.get('sysFanRpm', 0),
                'gpuFanRpm': e.get('gpuFanRpm', 0),
                'sysMode': e.get('sysMode', 1),
                'gpuMode': e.get('gpuMode', 0)
            })
        
        self.send_json(chart_data)
    
    def handle_get_config(self):
        self.send_json(get_current_config())
    
    def handle_post_config(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            new_config = json.loads(body.decode())
            
            # Update runtime override if provided
            if 'override' in new_config:
                runtime_override['system'] = new_config['override'].get('system', runtime_override['system'])
                runtime_override['gpu'] = new_config['override'].get('gpu', runtime_override['gpu'])
            
            save_config(new_config)
            self.send_json({'success': True, 'message': 'Config saved'})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 400)
    
    def handle_override(self):
        """Handle instant mode override (no restart needed)"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode())
            
            # Expected format: { "type": "system"|"gpu", "enabled": bool, "mode": "0"|"1"|"2"|... }
            override_type = data.get('type')
            if override_type not in ['system', 'gpu']:
                self.send_json({'success': False, 'error': 'Invalid type'}, 400)
                return
            
            runtime_override[override_type]['enabled'] = data.get('enabled', False)
            if 'mode' in data:
                runtime_override[override_type]['mode'] = str(data['mode'])
            
            # Optionally save to config
            if data.get('save', False):
                save_config()
            
            self.send_json({
                'success': True, 
                'override': runtime_override
            })
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 400)
    
    def handle_restart(self):
        """Restart the service via systemctl"""
        try:
            self.send_json({'success': True, 'message': 'Restarting...'})
            # Schedule restart after response is sent
            threading.Thread(target=lambda: (time.sleep(0.5), os.system('systemctl restart fan-control')), daemon=True).start()
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)

def start_http_server():
    server = HTTPServer(('0.0.0.0', HTTP_PORT), FanControlHandler)
    server.serve_forever()

# --- FAN CONTROL CONSTANTS ---
TOLERANCE = 30
PWM_MIN = 0
PWM_MAX = 255
STEP_SIZE = 2

class AutoStateManager:
    def __init__(self, config):
        self.config = config
        self.current_mode = '0' if '0' in config['TARGETS'] else '1'
        self.last_mode_change_time = 0
        self.pending_mode = None
        self.pending_start_time = 0
        self.status_msg = "Init"
        
        # Sort mode keys to ensure correct hierarchy check (4 > 3 > 2 > 1 > 0)
        self.mode_keys = sorted(config['THRESHOLDS'].keys(), key=lambda x: int(x), reverse=True)

    def update(self, cpu, gpu, hdd):
        now = time.time()
        
        # 1. Determine "Instant" Mode
        instant_mode = '0' if '0' in self.config['TARGETS'] else '1'
        
        for mode in self.mode_keys:
            thresh = self.config['THRESHOLDS'][mode]
            # Simple "OR" logic: if ANY metric exceeds threshold, trigger mode
            if cpu > thresh[0] or gpu > thresh[1] or hdd > thresh[2]:
                instant_mode = mode
                break
        
        # 2. State Machine
        curr_lvl = int(self.current_mode)
        inst_lvl = int(instant_mode)
        
        if inst_lvl > curr_lvl: # Escalation
            delay = self.config['DELAY_UP']
            
            if self.pending_mode != instant_mode:
                self.pending_mode = instant_mode
                self.pending_start_time = now
                self.status_msg = f"Pending Lvl{inst_lvl} ({delay}s)"
                return self.current_mode
            
            elapsed = now - self.pending_start_time
            if elapsed >= delay:
                self.current_mode = instant_mode
                self.last_mode_change_time = now
                self.pending_mode = None
                self.status_msg = "Escalated"
            else:
                self.status_msg = f"Pending Lvl{inst_lvl} ({delay - elapsed:.1f}s)"
                
        elif inst_lvl < curr_lvl: # De-escalation
            self.pending_mode = None
            hold = self.config['HOLD_TIME'].get(self.current_mode, 30)
            time_in_mode = now - self.last_mode_change_time
            remaining = hold - time_in_mode
            
            if remaining > 0:
                self.status_msg = f"Locked (Hold {remaining:.0f}s)"
            else:
                self.current_mode = instant_mode
                self.last_mode_change_time = now
                self.status_msg = "De-escalated"
        else:
            self.pending_mode = None
            self.status_msg = "Stable"
            
        return self.current_mode

class SystemFanController:
    def __init__(self, name, pwm_path, fan_input_path):
        self.name = name
        self.pwm_path = pwm_path
        self.fan_input_path = fan_input_path
        self.current_pwm = self.get_initial_pwm()
        self.current_rpm = 0
        self.target_rpm = 1200
        self.enable_manual_control()

    def get_initial_pwm(self):
        if not self.pwm_path: return 128
        try:
            with open(self.pwm_path, 'r') as f: return int(f.read().strip())
        except: return 128

    def enable_manual_control(self):
        try:
            with open(self.pwm_path + "_enable", 'w') as f: f.write('1')
        except: pass

    def get_rpm(self):
        try:
            with open(self.fan_input_path, 'r') as f: return int(f.read().strip())
        except: return 0

    def set_pwm(self, val):
        val = max(PWM_MIN, min(PWM_MAX, int(val)))
        try:
            with open(self.pwm_path, 'w') as f: f.write(str(val))
            self.current_pwm = val
        except: pass

    def update(self):
        self.current_rpm = self.get_rpm()
        error = self.target_rpm - self.current_rpm
        if abs(error) > TOLERANCE:
            step = STEP_SIZE
            if abs(error) > 200: step *= 2
            if error > 0: self.current_pwm += step
            else: self.current_pwm -= step
            self.set_pwm(self.current_pwm)

class GPUFanController:
    def __init__(self):
        self.current_pct = 0
        self.is_manual_active = False
        # Always force reset on startup to clear any external manual states
        self.reset()

    def reset(self):
        """Forces GPU back to Driver/Auto Control"""
        try:
            subprocess.run(['nvidia-settings', '-c', ':0', '-a', '[gpu:0]/GPUFanControlState=0'], 
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.is_manual_active = False
        except: pass

    def set_target(self, target_pct):
        if target_pct == 0:
            # Auto Mode
            if self.is_manual_active:
                self.reset()
        else:
            # Manual Mode
            if not self.is_manual_active:
                subprocess.run(['nvidia-settings', '-c', ':0', '-a', '[gpu:0]/GPUFanControlState=1'], 
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self.is_manual_active = True
                time.sleep(0.2)
            
            if target_pct != self.current_pct:
                subprocess.run(['nvidia-settings', '-c', ':0', 
                                '-a', f'[fan:0]/GPUTargetFanSpeed={target_pct}',
                                '-a', f'[fan:1]/GPUTargetFanSpeed={target_pct}'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self.current_pct = target_pct

# --- Sensors ---
def get_vals():
    cpu = 0
    try:
        with open(glob.glob('/sys/class/hwmon/hwmon*/temp1_input')[0], 'r') as f: 
            cpu = int(f.read().strip()) / 1000.0
    except: pass

    gpu = 0
    try:
        out = subprocess.check_output(['nvidia-smi', '--query-gpu=temperature.gpu', '--format=csv,noheader'], stderr=subprocess.DEVNULL)
        gpu = int(out.strip())
    except: pass

    gpu_fans = {'fan0': {'rpm':0, 'pct':0}, 'fan1': {'rpm':0, 'pct':0}}
    try:
        cmd = ['nvidia-settings', '-c', ':0', '-t', '-q', '[fan:0]/GPUCurrentFanSpeedRPM', '-q', '[fan:0]/GPUCurrentFanSpeed', '-q', '[fan:1]/GPUCurrentFanSpeedRPM', '-q', '[fan:1]/GPUCurrentFanSpeed']
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode().strip().split('\n')
        gpu_fans['fan0'] = {'rpm': int(out[0]), 'pct': int(out[1])}
        gpu_fans['fan1'] = {'rpm': int(out[2]), 'pct': int(out[3])}
    except: pass

    hdd_max = -100
    hdd_all = {}
    try:
        drives = sorted(list(set(re.findall(r'(sd[a-z]+)\[\d+\]', open('/proc/mdstat').read()))))
        for d in drives:
            try:
                o = subprocess.check_output(['smartctl', '-j', '-A', f'/dev/{d}'], stderr=subprocess.DEVNULL)
                j = json.loads(o)
                t = j.get('temperature', {}).get('current')
                if t is None:
                    for a in j.get('ata_smart_attributes', {}).get('table', []):
                        if a['id'] == 194: t = a['raw']['value'] & 0xFF; break
                if t: 
                    hdd_all[d] = t
                    if t > hdd_max: hdd_max = t
            except: hdd_all[d] = 'Err'
    except: pass
    
    return cpu, gpu, hdd_max if hdd_max != -100 else 0, hdd_all, gpu_fans

def get_it8613_path():
    for p in glob.glob('/sys/class/hwmon/hwmon*'):
        try:
            if open(os.path.join(p, 'name')).read().strip() == 'it8613': return p
        except: continue
    return None

def main():
    print(f"Initializing Fan Control Daemon with Web UI on port {HTTP_PORT}...")
    it8613 = get_it8613_path()
    if not it8613: 
        print("ERROR: IT8613 not found!")
        return

    # Controllers
    sys_fans = [
        SystemFanController('Fan2', os.path.join(it8613, 'pwm2'), os.path.join(it8613, 'fan2_input')),
        SystemFanController('Fan3', os.path.join(it8613, 'pwm3'), os.path.join(it8613, 'fan3_input'))
    ]
    gpu_ctl = GPUFanController()

    # Logic
    sys_logic = AutoStateManager(SYS_CONFIG)
    gpu_logic = AutoStateManager(GPU_CONFIG)
    
    last_sys_mode = None
    last_gpu_mode = None
    last_log_time = 0
    interactive = sys.stdout.isatty()

    # Start HTTP server in background
    http_thread = threading.Thread(target=start_http_server, daemon=True)
    http_thread.start()
    print(f"Web UI available at http://0.0.0.0:{HTTP_PORT}")

    try:
        while True:
            # 1. Read Sensors
            cpu, gpu, hdd, hdd_all, gpu_fans = get_vals()

            # 2. Update Logic (Auto or Manual Override)
            if runtime_override['system']['enabled']:
                sys_mode = runtime_override['system']['mode']
                sys_logic.status_msg = "MANUAL"
            else:
                sys_mode = sys_logic.update(cpu, gpu, hdd)
            
            if runtime_override['gpu']['enabled']:
                gpu_mode = runtime_override['gpu']['mode']
                gpu_logic.status_msg = "MANUAL"
            else:
                gpu_mode = gpu_logic.update(cpu, gpu, hdd)

            # 3. Apply Targets
            sys_target = SYS_CONFIG['TARGETS'].get(sys_mode, 1200)
            for f in sys_fans:
                f.target_rpm = sys_target
                f.update()
            
            gpu_target_pct = GPU_CONFIG['TARGETS'].get(gpu_mode, 0)
            gpu_ctl.set_target(gpu_target_pct)

            # 4. Build API Data
            now = time.time()
            time_str = time.strftime('%H:%M:%S')
            
            # Build fans list
            fans_data = []
            for f in sys_fans:
                status = "OK" if abs(f.current_rpm - f.target_rpm) < TOLERANCE else "ADJ"
                fans_data.append({
                    'id': f.name.lower().replace(' ', '_'),
                    'name': f.name,
                    'type': 'SYS',
                    'rpm': f.current_rpm,
                    'target': f.target_rpm,
                    'pwmOrPct': f.current_pwm,
                    'status': status
                })
            
            tgt_str = "Auto" if gpu_target_pct == 0 else f"{gpu_target_pct}%"
            for i, key in enumerate(['fan0', 'fan1']):
                pct = gpu_fans[key]['pct']
                status = "OK" if gpu_target_pct == 0 or abs(pct - gpu_target_pct) <= 2 else "ADJ"
                fans_data.append({
                    'id': f'gpu_{key}',
                    'name': f'GPU Fan {i+1}',
                    'type': 'GPU',
                    'rpm': gpu_fans[key]['rpm'],
                    'target': tgt_str,
                    'pwmOrPct': pct,
                    'status': status
                })
            
            # Build HDD list
            hdd_list = [{'device': k, 'temp': v} for k, v in hdd_all.items()]
            
            # Build full state
            api_data = {
                'timestamp': int(now * 1000),
                'temps': {
                    'cpu': round(cpu, 1),
                    'gpu': gpu,
                    'hddMax': hdd,
                    'hddList': hdd_list
                },
                'logic': {
                    'system': {
                        'mode': sys_mode,
                        'target': sys_target,
                        'status': sys_logic.status_msg,
                        'isManual': runtime_override['system']['enabled']
                    },
                    'gpu': {
                        'mode': gpu_mode,
                        'target': tgt_str,
                        'status': gpu_logic.status_msg,
                        'isManual': runtime_override['gpu']['enabled']
                    }
                },
                'fans': fans_data,
                'override': runtime_override
            }
            
            # Update shared state for API
            with current_state['lock']:
                current_state['data'] = api_data
            
            # 5. Log to file (every LOG_INTERVAL seconds)
            if now - last_log_time >= LOG_INTERVAL:
                log_entry = {
                    'time': time_str,
                    'timestamp': now,
                    'temps': api_data['temps'],
                    'sysFanRpm': fans_data[0]['rpm'] if fans_data else 0,
                    'gpuFanRpm': fans_data[2]['rpm'] if len(fans_data) > 2 else 0,
                    'sysMode': int(sys_mode),
                    'gpuMode': int(gpu_mode)
                }
                history_logger.info(json.dumps(log_entry))
                last_log_time = now

            # 6. Console output
            if interactive:
                print("\033c", end="")
                print(f"=== FULL AUTO MONITOR === (Web: http://0.0.0.0:{HTTP_PORT})")
                print("-" * 50)
                print(f"SYSTEM Logic: Mode {sys_mode} ({sys_target} RPM) | {sys_logic.status_msg}")
                print(f"GPU    Logic: Mode {gpu_mode} ({tgt_str}) | {gpu_logic.status_msg}")
                print("-" * 50)
                
                c_al = " (!)" if cpu > SYS_CONFIG['THRESHOLDS']['2'][0] else ""
                g_al = " (!)" if gpu > SYS_CONFIG['THRESHOLDS']['2'][1] else ""
                h_al = " (!)" if hdd > SYS_CONFIG['THRESHOLDS']['2'][2] else ""

                print(f"CPU: {cpu:.1f}°C{c_al}")
                print(f"GPU: {gpu}°C{g_al}")
                print(f"HDD Max: {hdd}°C{h_al}")
                print("-" * 50)
                
                for f in sys_fans:
                    s = "OK" if abs(f.current_rpm - f.target_rpm) < TOLERANCE else "ADJ"
                    print(f"[{f.name}] RPM: {f.current_rpm:4d} | Target: {f.target_rpm} | PWM: {f.current_pwm:3d} | {s}")
                
                f0_pct = gpu_fans['fan0']['pct']
                s0 = "OK" if gpu_target_pct == 0 or abs(f0_pct - gpu_target_pct) <= 2 else "ADJ"
                print(f"[GPU Fan1] RPM: {gpu_fans['fan0']['rpm']:4d} | Target: {tgt_str:<4} | %  : {f0_pct:3d} | {s0}")
                
                f1_pct = gpu_fans['fan1']['pct']
                s1 = "OK" if gpu_target_pct == 0 or abs(f1_pct - gpu_target_pct) <= 2 else "ADJ"
                print(f"[GPU Fan2] RPM: {gpu_fans['fan1']['rpm']:4d} | Target: {tgt_str:<4} | %  : {f1_pct:3d} | {s1}")
                
                print("-" * 50)
                items = list(hdd_all.items())
                for i in range(0, len(items), 4):
                    print(" | ".join([f"{k}:{v}°C" for k,v in items[i:i+4]]))
            else:
                # Daemon Mode: Log only changes
                if sys_mode != last_sys_mode:
                    print(f"[{time.ctime()}] SYSTEM Change: Mode {last_sys_mode} -> {sys_mode} (Target: {sys_target} RPM) | CPU:{cpu} GPU:{gpu} HDD:{hdd}")
                    sys.stdout.flush()
                
                if gpu_mode != last_gpu_mode:
                    print(f"[{time.ctime()}] GPU Change: Mode {last_gpu_mode} -> {gpu_mode} (Target: {tgt_str}) | GPU Temp:{gpu}")
                    sys.stdout.flush()

            last_sys_mode = sys_mode
            last_gpu_mode = gpu_mode
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nExiting... Resetting GPU to Auto.")
        gpu_ctl.reset()


if __name__ == "__main__":
    main()