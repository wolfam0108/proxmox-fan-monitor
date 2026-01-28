"""
Fan Control Configuration Module

Handles configuration loading, saving, migration, and format conversion.
Now supports dynamic fan_groups for flexible configuration.
"""
import json
from pathlib import Path

# --- CONFIG FILE PATH ---
CONFIG_FILE = Path(__file__).parent.parent / 'fan_config.json'

# Runtime override state (keyed by group_id)
runtime_override = {}

# Current config in profile format (for API)
current_config = None

# --- DEFAULT CONFIG (empty - user configures everything via UI) ---
DEFAULT_CONFIG = {
    'fan_groups': [],  # Empty - user adds groups via wizard
    'override': {},
    'drives': {
        'monitored': []
    }
}


def get_group_by_id(config, group_id):
    """Get a fan group by its ID"""
    for group in config.get('fan_groups', []):
        if group['id'] == group_id:
            return group
    return None


def migrate_old_config(old_cfg):
    """
    Migrate old format config (system/gpu sections) to new format (fan_groups array)
    """
    new_cfg = {
        'fan_groups': [],
        'override': {},
        'drives': old_cfg.get('drives', {'monitored': []})
    }
    
    # Migrate GPU config -> fan_group type=nvidia
    if 'gpu' in old_cfg:
        old_gpu = old_cfg['gpu']
        profiles = old_gpu.get('profiles', [])
        
        # Handle old targets/thresholds format
        if 'targets' in old_gpu and 'profiles' not in old_gpu:
            profiles = []
            targets = old_gpu.get('targets', {})
            thresholds = old_gpu.get('thresholds', {})
            mode_keys = sorted(targets.keys(), key=lambda x: int(x))
            names = {'0': 'Авто', '1': 'Уровень 1', '2': 'Уровень 2', '3': 'Уровень 3', '4': 'Максимум'}
            
            for mode in mode_keys:
                thresh = thresholds.get(mode, [None, None, None])
                gpu_t = thresh[1] if isinstance(thresh, (list, tuple)) and len(thresh) >= 2 and thresh[1] != 999 else None
                profiles.append({
                    'name': names.get(mode, f'Режим {mode}'),
                    'target': targets[mode],
                    'thresholds': {'gpu': gpu_t}
                })
        
        gpu_group = {
            'id': 'gpu',
            'name': 'GPU',
            'type': 'nvidia',
            'temp_sources': ['gpu'],
            'fans': [],
            'profiles': profiles,
            'delay_up': old_gpu.get('delay_up', 5),
            'hold_time': old_gpu.get('hold_time', 30) if isinstance(old_gpu.get('hold_time'), int) else 30
        }
        new_cfg['fan_groups'].append(gpu_group)
        
        # Migrate GPU override
        if 'override' in old_cfg and 'gpu' in old_cfg['override']:
            ovr = old_cfg['override']['gpu']
            new_cfg['override']['gpu'] = {
                'enabled': ovr.get('enabled', False),
                'mode': int(ovr.get('mode', 0)) if str(ovr.get('mode', '0')).isdigit() else 0
            }
    
    # NOTE: Old system config is NOT migrated as fan_group
    # User will need to create new system fan groups via wizard
    # This is intentional - the old system config was hardware-specific
    
    return new_cfg


def profiles_to_legacy_format(group):
    """Convert a fan_group's profiles to legacy format for AutoStateManager"""
    targets = {}
    thresholds = {}
    hold_time = {}
    
    temp_sources = group.get('temp_sources', ['cpu', 'gpu', 'hdd'])
    
    for i, profile in enumerate(group.get('profiles', [])):
        mode_key = str(i)
        targets[mode_key] = profile['target']
        

        
        thresh = profile.get('thresholds', {})
        if i > 0:  # Skip first profile (base mode has no thresholds)
            # Use active thresholds that match temp_sources
            active_thresh = {k: v for k, v in thresh.items() if k in temp_sources and v is not None}
            thresholds[mode_key] = active_thresh
        
        hold_time[mode_key] = group.get('hold_time', 30)
    
    return {
        'NAME': group.get('name', 'Unknown'),
        'TARGETS': targets,
        'THRESHOLDS': thresholds,
        'DELAY_UP': group.get('delay_up', 5),
        'HOLD_TIME': hold_time
    }


def load_config():
    """Load config from JSON file or use defaults"""
    global runtime_override, current_config
    
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r') as f:
                cfg = json.load(f)
            
            # Check if old format (has system/gpu as top-level, no fan_groups)
            needs_migration = False
            if 'fan_groups' not in cfg and ('system' in cfg or 'gpu' in cfg):
                needs_migration = True
            
            if needs_migration:
                print("Migrating config to new fan_groups format...")
                cfg = migrate_old_config(cfg)
                with open(CONFIG_FILE, 'w') as f:
                    json.dump(cfg, f, indent=2, ensure_ascii=False)
                print("Config migrated and saved.")
            
            current_config = cfg
            
            # Load overrides for each group
            runtime_override = {}
            for group in cfg.get('fan_groups', []):
                group_id = group['id']
                ovr = cfg.get('override', {}).get(group_id, {'enabled': False, 'mode': 0})
                runtime_override[group_id] = {
                    'enabled': ovr.get('enabled', False),
                    'mode': str(ovr.get('mode', 0))
                }
            
            print(f"Config loaded from {CONFIG_FILE}")
            print(f"  Fan groups: {[g['name'] for g in cfg.get('fan_groups', [])]}")
        except Exception as e:
            print(f"Error loading config: {e}, using defaults")
            current_config = DEFAULT_CONFIG.copy()
            _init_runtime_override()
    else:
        current_config = DEFAULT_CONFIG.copy()
        _init_runtime_override()
        save_config(current_config)
        print(f"Created default config at {CONFIG_FILE}")


def _init_runtime_override():
    """Initialize runtime override from current config"""
    global runtime_override
    runtime_override = {}
    for group in current_config.get('fan_groups', []):
        group_id = group['id']
        ovr = current_config.get('override', {}).get(group_id, {'enabled': False, 'mode': 0})
        runtime_override[group_id] = {
            'enabled': ovr.get('enabled', False),
            'mode': str(ovr.get('mode', 0))
        }


def save_config(config=None):
    """Save current config to JSON file"""
    global current_config, runtime_override
    
    if config is None:
        config = current_config if current_config else DEFAULT_CONFIG
    
    current_config = config
    
    # Sync runtime override
    if 'override' in config:
        for group_id, ovr in config['override'].items():
            runtime_override[group_id] = {
                'enabled': ovr.get('enabled', False),
                'mode': str(ovr.get('mode', 0))
            }
    
    # Filter out legacy fields that are added by get_current_config for API compatibility
    # Only save core config fields
    core_fields = ['fan_groups', 'override', 'drives', 'sensors', 'cpu_sensor_path']
    config_to_save = {k: v for k, v in config.items() if k in core_fields}
    
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config_to_save, f, indent=2, ensure_ascii=False)


def add_fan_group(group):
    """Add a new fan group to the config"""
    global current_config
    
    if current_config is None:
        current_config = DEFAULT_CONFIG.copy()
    
    if 'fan_groups' not in current_config:
        current_config['fan_groups'] = []
    
    # Check for duplicate ID
    existing_ids = [g['id'] for g in current_config['fan_groups']]
    if group['id'] in existing_ids:
        raise ValueError(f"Group with ID '{group['id']}' already exists")
    
    current_config['fan_groups'].append(group)
    
    # Initialize override for this group
    if 'override' not in current_config:
        current_config['override'] = {}
    current_config['override'][group['id']] = {'enabled': False, 'mode': 0}
    runtime_override[group['id']] = {'enabled': False, 'mode': '0'}
    
    save_config()
    return group


def remove_fan_group(group_id):
    """Remove a fan group from the config"""
    global current_config
    
    if current_config is None:
        return False
    
    # Don't allow removing nvidia group
    group = get_group_by_id(current_config, group_id)
    if group and group.get('type') == 'nvidia':
        raise ValueError("Cannot remove built-in GPU group")
    
    original_len = len(current_config.get('fan_groups', []))
    current_config['fan_groups'] = [g for g in current_config.get('fan_groups', []) if g['id'] != group_id]
    
    # Remove override
    if 'override' in current_config and group_id in current_config['override']:
        del current_config['override'][group_id]
    if group_id in runtime_override:
        del runtime_override[group_id]
    
    if len(current_config['fan_groups']) < original_len:
        save_config()
        return True
    return False


def get_current_config():
    """Get current config as dict for API - includes legacy system/gpu fields for compatibility"""
    global current_config
    if current_config is None:
        return DEFAULT_CONFIG
    
    result = current_config.copy()
    
    # Add current runtime override state
    result['override'] = {}
    for group_id, ovr in runtime_override.items():
        result['override'][group_id] = {
            'enabled': ovr['enabled'],
            'mode': int(ovr['mode']) if str(ovr['mode']).isdigit() else 0
        }
    
    # Add backward-compatible system/gpu fields for SettingsPanel
    for group in current_config.get('fan_groups', []):
        if group.get('type') == 'nvidia':
            result['gpu'] = {
                'profiles': group.get('profiles', []),
                'delay_up': group.get('delay_up', 5),
                'hold_time': group.get('hold_time', 30)
            }
        elif group['id'] != 'gpu':
            # First non-nvidia group becomes "system" for legacy compatibility
            if 'system' not in result:
                result['system'] = {
                    'profiles': group.get('profiles', []),
                    'delay_up': group.get('delay_up', 5),
                    'hold_time': group.get('hold_time', 30)
                }
    
    # Provide defaults if no groups exist
    if 'system' not in result:
        result['system'] = {
            'profiles': [
                {'name': 'Тихий', 'target': 1200, 'thresholds': {}},
                {'name': 'Стандарт', 'target': 1600, 'thresholds': {}},
                {'name': 'Критический', 'target': 2000, 'thresholds': {}}
            ],
            'delay_up': 5,
            'hold_time': 30
        }
    if 'gpu' not in result:
        result['gpu'] = {
            'profiles': [
                {'name': 'Авто', 'target': 0, 'thresholds': {}},
            ],
            'delay_up': 5,
            'hold_time': 30
        }
    
    return result


def get_system_groups():
    """Get all system-type fan groups (not nvidia)"""
    if current_config is None:
        return []
    return [g for g in current_config.get('fan_groups', []) if g.get('type') != 'nvidia']


def get_nvidia_group():
    """Get the nvidia GPU group"""
    if current_config is None:
        return None
    for g in current_config.get('fan_groups', []):
        if g.get('type') == 'nvidia':
            return g
    return None
