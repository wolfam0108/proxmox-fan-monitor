"""
State Manager Module

AutoStateManager handles automatic fan mode switching based on temperature thresholds.
"""
import time


class AutoStateManager:
    """Automatic fan mode state machine with escalation/de-escalation logic"""
    
    def __init__(self, config):
        self.config = config
        self.current_mode = '0' if '0' in config['TARGETS'] else '1'
        self.last_mode_change_time = 0
        self.pending_mode = None
        self.pending_start_time = 0
        self.status_msg = "Init"
        
        # Sort mode keys for correct hierarchy check (4 > 3 > 2 > 1 > 0)
        self.mode_keys = sorted(config['THRESHOLDS'].keys(), key=lambda x: int(x), reverse=True)

    def update(self, sensor_values):
        """Update state machine with current temperatures, returns current mode"""
        now = time.time()
        
        # 1. Determine "Instant" Mode
        instant_mode = '0' if '0' in self.config['TARGETS'] else '1'
        
        for mode in self.mode_keys:
            thresh = self.config['THRESHOLDS'][mode]
            
            # OR logic: if ANY configured metric exceeds its threshold
            # Config structure: {'cpu': 60, 'gpu': 70, 'custom_sensor': 50}
            triggered = False
            for source, limit in thresh.items():
                if limit is not None:
                    # Lookup current value for this source
                    val = sensor_values.get(source, 0)
                    if val > limit:
                        triggered = True
                        break
            
            if triggered:
                instant_mode = mode
                break
        
        # 2. State Machine
        curr_lvl = int(self.current_mode)
        inst_lvl = int(instant_mode)
        
        if inst_lvl > curr_lvl:  # Escalation
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
                
        elif inst_lvl < curr_lvl:  # De-escalation
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
