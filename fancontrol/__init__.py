"""
Fan Control Package

Modular fan control system for system and GPU fan management.
Now uses dynamic fan_groups for flexible configuration.
"""

from . import config
from . import drives
from . import sensors
from . import controllers
from . import state_manager
from . import web
from . import fan_scanner
from . import gpu_scanner
from . import cpu_scanner
from . import sensor_manager

# Re-export commonly used items
from .config import (
    runtime_override,
    current_config,
    DEFAULT_CONFIG,
    load_config,
    save_config,
    get_current_config,
    get_group_by_id,
    get_system_groups,
    get_nvidia_group,
    add_fan_group,
    remove_fan_group,
    profiles_to_legacy_format
)

from .drives import scan_all_drives, get_configured_drives
from .sensors import get_vals, get_it8613_path
from .controllers import SystemFanController, GPUFanController, TOLERANCE, PWM_MIN, PWM_MAX, STEP_SIZE
from .state_manager import AutoStateManager
from .web import start_http_server, current_state, history_logger, LOG_INTERVAL
from .fan_scanner import scan_all, test_pwm

# Load config on package import
load_config()
