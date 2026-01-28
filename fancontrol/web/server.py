"""
Web Server Module

HTTP server for fan control API and static file serving.
"""
import os
import json
import time
import threading
import logging
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from logging.handlers import RotatingFileHandler

from .. import config
from .. import fan_scanner
from .. import gpu_scanner
from .. import cpu_scanner
from .. import sensor_manager

# --- WEB SERVER CONFIG ---
HTTP_PORT = 8080
STATIC_DIR = Path(__file__).parent.parent.parent / 'fancontrol-ui' / 'dist'
LOG_DIR = Path('/var/log/fan_control')
LOG_FILE = LOG_DIR / 'history.jsonl'
LOG_MAX_BYTES = 10 * 1024 * 1024
LOG_BACKUP_COUNT = 5
LOG_INTERVAL = 5

# --- SETUP LOGGING ---
LOG_DIR.mkdir(parents=True, exist_ok=True)

history_logger = logging.getLogger('history')
history_logger.setLevel(logging.INFO)
_handler = RotatingFileHandler(LOG_FILE, maxBytes=LOG_MAX_BYTES, backupCount=LOG_BACKUP_COUNT)
_handler.setFormatter(logging.Formatter('%(message)s'))
history_logger.addHandler(_handler)

# --- SHARED STATE ---
current_state = {
    'data': None,
    'lock': threading.Lock()
}


def get_history_from_logs(limit=300):
    """Read last N entries from log files"""
    entries = []
    try:
        # Sort log files: current file first, then rotated files in order (.1, .2, ...)
        log_files = list(LOG_DIR.glob('history.jsonl*'))
        def sort_key(p):
            name = p.name
            if name == 'history.jsonl':
                return 0  # Current file first
            # Extract rotation number from history.jsonl.1, history.jsonl.2, etc
            try:
                return int(name.split('.')[-1])
            except:
                return 999
        log_files.sort(key=sort_key)
        
        for log_file in log_files:
            if len(entries) >= limit:
                break
            try:
                with open(log_file, 'r') as f:
                    lines = f.readlines()
                    # Read from end of file (newest entries last in file)
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
        pass
    
    def parse_query(self):
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

        elif path == '/api/fans/scan':
            self.handle_fans_scan()
        elif path == '/api/fans/rpm':
            self.handle_fans_rpm()
        elif path == '/api/gpu/scan':
            self.handle_gpu_scan()
        elif path == '/api/gpu/fans':
            self.handle_gpu_fans()
        elif path == '/api/cpu/scan':
            self.handle_cpu_scan()
        elif path == '/api/sensors/scan':
            self.handle_sensors_scan()
        elif path == '/api/sensors':
            self.handle_get_sensors()
        else:
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

        elif path == '/api/fans/test':
            self.handle_fans_test()
        elif path == '/api/fan-groups':
            self.handle_post_fan_group()
        elif path == '/api/gpu/test':
            self.handle_gpu_test()
        elif path == '/api/gpu-group':
            self.handle_post_gpu_group()
        elif path == '/api/cpu/sensor':
            self.handle_post_cpu_sensor()
        elif path == '/api/sensors':
            self.handle_post_sensor()
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_DELETE(self):
        path = self.path.split('?')[0]
        
        if path.startswith('/api/sensors/'):
            sensor_id = path.split('/')[-1]
            self.handle_delete_sensor(sensor_id)
        else:
            self.send_response(404)
            self.send_cors_headers()
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
        range_map = {'1m': 60, '5m': 300, '30m': 1800, '1h': 3600, '6h': 21600, '1d': 86400, '1w': 604800, '1mo': 2592000}
        range_key = params.get('range', '30m')
        range_seconds = range_map.get(range_key, 1800)
        
        max_entries = min(range_seconds // LOG_INTERVAL + 10, 10000)
        entries = get_history_from_logs(max_entries)
        
        now = time.time()
        cutoff_time = now - range_seconds
        
        chart_data = []
        for e in entries:
            ts = e.get('timestamp', 0)
            if ts and ts < cutoff_time:
                continue
            
            chart_data.append({
                'time': e.get('time', ''),
                'timestamp': ts,
                'cpu': e.get('temps', {}).get('cpu', 0),
                'gpu': e.get('temps', {}).get('gpu', 0),
                'temps': e.get('temps', {}),
                'sensors': e.get('sensors', []),
                'logic': e.get('logic', {}),
                'fans': {f['id']: f.get('pwmOrPct', 0) for f in e.get('fans', [])}
            })
        
        self.send_json(chart_data)
    
    def handle_get_config(self):
        self.send_json(config.get_current_config())
    
    def handle_post_config(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            new_config = json.loads(body.decode())
            
            # Update runtime overrides - support both old and new format
            if 'override' in new_config:
                for group_id, ovr in new_config['override'].items():
                    config.runtime_override[group_id] = {
                        'enabled': ovr.get('enabled', False),
                        'mode': str(ovr.get('mode', 0))
                    }
            
            config.save_config(new_config)
            self.send_json({'success': True, 'message': 'Config saved'})
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_json({'success': False, 'error': str(e)}, 400)
    
    def handle_override(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode())
            
            override_type = data.get('type')
            
            # Validate that group exists in config
            valid_group_ids = [g['id'] for g in config.current_config.get('fan_groups', [])]
            if override_type not in valid_group_ids:
                self.send_json({'success': False, 'error': f'Invalid group: {override_type}'}, 400)
                return
            
            # Initialize override for group if not exists
            if override_type not in config.runtime_override:
                config.runtime_override[override_type] = {'enabled': False, 'mode': '0'}
            
            config.runtime_override[override_type]['enabled'] = data.get('enabled', False)
            if 'mode' in data:
                config.runtime_override[override_type]['mode'] = str(data['mode'])
            
            if data.get('save', False):
                config.save_config()
            
            self.send_json({
                'success': True, 
                'override': config.runtime_override
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_json({'success': False, 'error': str(e)}, 400)
    
    def handle_restart(self):
        try:
            self.send_json({'success': True, 'message': 'Restarting...'})
            threading.Thread(
                target=lambda: (time.sleep(0.5), os.system('systemctl restart fan-control')),
                daemon=True
            ).start()
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    

    

    

    

    

    
    def handle_fans_scan(self):
        """Return all detected fans and PWM controllers (System + GPU)"""
        try:
            result = fan_scanner.scan_unified()
            self.send_json(result)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_fans_rpm(self):
        """Return current RPM for all fans (for real-time updates)"""
        try:
            rpm_data = fan_scanner.get_all_fans_rpm()
            self.send_json({'fans': rpm_data})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_fans_test(self):
        """Test a PWM controller by setting its value"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode())
            
            pwm_path = data.get('pwm_path', '')
            value = int(data.get('value', 0))
            
            if not pwm_path or not pwm_path.startswith('/sys/'):
                self.send_json({'success': False, 'error': 'Invalid pwm_path'}, 400)
                return
            
            result = fan_scanner.test_pwm(pwm_path, value)
            self.send_json(result)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 400)
    
    def handle_post_fan_group(self):
        """Handle adding a new fan group from wizard"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode())
            
            # Validate required fields
            required = ['id', 'name', 'temp_sources', 'fans']
            for field in required:
                if field not in data:
                    self.send_json({'success': False, 'error': f'Missing field: {field}'}, 400)
                    return
            
            # Build fan group object
            group = {
                'id': data['id'],
                'name': data['name'],
                'type': 'system',  # Wizard only creates system groups
                'temp_sources': data['temp_sources'],
                'fans': data['fans'],
                'profiles': data.get('profiles', [
                    {'name': 'Тихий', 'target': 800, 'thresholds': {}},
                    {'name': 'Стандарт', 'target': 1200, 'thresholds': {}},
                    {'name': 'Максимум', 'target': 2000, 'thresholds': {}}
                ]),
                'delay_up': data.get('delay_up', 5),
                'hold_time': data.get('hold_time', 30)
            }
            
            # Fill thresholds based on temp_sources
            for profile in group['profiles']:
                for src in data['temp_sources']:
                    if src not in profile['thresholds']:
                        profile['thresholds'][src] = None
            
            # Add group to config
            config.add_fan_group(group)
            
            self.send_json({
                'success': True,
                'message': f'Fan group "{data["name"]}" created',
                'group': group
            })
        except ValueError as e:
            self.send_json({'success': False, 'error': str(e)}, 400)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_gpu_scan(self):
        """Return all detected NVIDIA GPUs and their fans"""
        try:
            result = gpu_scanner.scan_all()
            self.send_json(result)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_gpu_fans(self):
        """Return current GPU fan speeds"""
        try:
            # Get GPU config from current config if available
            gpu_group = config.get_nvidia_group()
            if gpu_group:
                gpu_cfg = gpu_group.get('gpu_config', {})
                display = gpu_cfg.get('display', ':0')
                gpu_index = gpu_cfg.get('gpu_index', 0)
                fan_indices = gpu_cfg.get('fans', [0, 1])
            else:
                display = ':0'
                gpu_index = 0
                fan_indices = [0, 1]
            
            speeds = gpu_scanner.get_gpu_fan_speeds(gpu_index, display, fan_indices)
            self.send_json({'fans': speeds, 'display': display, 'gpu_index': gpu_index})
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_gpu_test(self):
        """Test a GPU fan by setting it to a specific speed"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode())
            
            fan_index = int(data.get('fan_index', 0))
            target_pct = int(data.get('target_pct', 50))
            gpu_index = int(data.get('gpu_index', 0))
            display = data.get('display', ':0')
            
            result = gpu_scanner.test_gpu_fan(fan_index, target_pct, gpu_index, display)
            self.send_json(result)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 400)
    
    def handle_post_gpu_group(self):
        """Handle adding a GPU group from UI"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode())
            
            # Build GPU group configuration
            gpu_config = {
                'display': data.get('display', ':0'),
                'gpu_index': data.get('gpu_index', 0),
                'fans': data.get('fans', [0, 1])
            }
            
            # Default profiles for GPU
            default_profiles = [
                {'name': 'Авто', 'target': 0, 'thresholds': {'gpu': None}},
                {'name': '45%', 'target': 45, 'thresholds': {'gpu': 58}},
                {'name': '50%', 'target': 50, 'thresholds': {'gpu': 70}},
                {'name': '60%', 'target': 60, 'thresholds': {'gpu': 74}},
                {'name': '70%', 'target': 70, 'thresholds': {'gpu': 76}},
                {'name': '85%', 'target': 85, 'thresholds': {'gpu': 79}},
                {'name': 'Максимум', 'target': 100, 'thresholds': {'gpu': 82}}
            ]
            
            group = {
                'id': 'gpu',
                'name': data.get('name', 'GPU'),
                'type': 'nvidia',
                'temp_sources': ['gpu'],
                'fans': [],  # GPU fans are managed differently
                'gpu_config': gpu_config,
                'profiles': data.get('profiles', default_profiles),
                'delay_up': data.get('delay_up', 5),
                'hold_time': data.get('hold_time', 30)
            }
            
            # Add group to config
            config.add_fan_group(group)
            
            self.send_json({
                'success': True,
                'message': f'GPU group "{group["name"]}" created',
                'group': group
            })
        except ValueError as e:
            self.send_json({'success': False, 'error': str(e)}, 400)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_cpu_scan(self):
        """Return all detected CPU temperature sensors"""
        try:
            result = cpu_scanner.scan_all()
            self.send_json(result)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_post_cpu_sensor(self):
        """Save selected CPU sensor path"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode())
            
            sensor_path = data.get('path')
            if not sensor_path:
                self.send_json({'success': False, 'error': 'Missing path'}, 400)
                return
            
            # Update config with new CPU sensor path
            current = config.get_current_config()
            current['cpu_sensor_path'] = sensor_path
            config.save_config(current)
            
            self.send_json({
                'success': True,
                'message': 'CPU sensor saved',
                'path': sensor_path
            })
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_sensors_scan(self):
        """Scan all available temperature sources"""
        try:
            sources = sensor_manager.scan_all_sources()
            self.send_json({
                'success': True,
                'sources': sources,
                'summary': {
                    'hwmon': len(sources.get('hwmon', [])),
                    'nvidia': len(sources.get('nvidia', [])),
                    'drives': len(sources.get('drives', []))
                }
            })
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_get_sensors(self):
        """Get configured sensors with current values"""
        try:
            current = config.get_current_config()
            sensors_config = current.get('sensors', [])
            
            # Get current values for each sensor
            sensors_with_values = []
            for sensor in sensors_config:
                value = sensor_manager.read_sensor_value(sensor)
                sensors_with_values.append({
                    **sensor,
                    'current_value': value
                })
            
            self.send_json({
                'success': True,
                'sensors': sensors_with_values
            })
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_post_sensor(self):
        """Create or update a sensor"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode())
            
            # Validate required fields
            if not data.get('id') or not data.get('name') or not data.get('type'):
                self.send_json({'success': False, 'error': 'Missing required fields: id, name, type'}, 400)
                return
            
            # Validate sensor config
            if not sensor_manager.validate_sensor(data):
                self.send_json({'success': False, 'error': 'Invalid sensor configuration'}, 400)
                return
            
            # Get current config
            current = config.get_current_config()
            if 'sensors' not in current:
                current['sensors'] = []
            
            # Check if sensor already exists (update) or new
            existing_idx = None
            for i, s in enumerate(current['sensors']):
                if s['id'] == data['id']:
                    existing_idx = i
                    break
            
            if existing_idx is not None:
                current['sensors'][existing_idx] = data
                message = f"Sensor '{data['name']}' updated"
            else:
                current['sensors'].append(data)
                message = f"Sensor '{data['name']}' created"
            
            config.save_config(current)
            
            self.send_json({
                'success': True,
                'message': message,
                'sensor': data
            })
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)
    
    def handle_delete_sensor(self, sensor_id: str):
        """Delete a sensor by ID"""
        try:
            current = config.get_current_config()
            sensors = current.get('sensors', [])
            
            # Find and remove sensor
            new_sensors = [s for s in sensors if s['id'] != sensor_id]
            
            if len(new_sensors) == len(sensors):
                self.send_json({'success': False, 'error': f"Sensor '{sensor_id}' not found"}, 404)
                return
            
            current['sensors'] = new_sensors
            config.save_config(current)
            
            self.send_json({
                'success': True,
                'message': f"Sensor '{sensor_id}' deleted"
            })
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, 500)


def start_http_server():
    """Start the HTTP server"""
    server = HTTPServer(('0.0.0.0', HTTP_PORT), FanControlHandler)
    server.serve_forever()
