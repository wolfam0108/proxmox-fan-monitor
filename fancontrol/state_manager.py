"""
State Manager Module

AutoStateManager handles automatic fan mode switching based on temperature thresholds.
"""
import time
import time



class AutoStateManager:

    """Refactored state machine using confirmed-state logic for absolute stability"""
    
    def __init__(self, config):
        self.config = config
        self.current_mode = '0' if '0' in config['TARGETS'] else '1'
        self.last_mode_change_time = 0
        
        # Confirmation logic
        self.pending_mode = None
        self.pending_start_time = 0
        
        self.status_msg = "Init"
        self.mode_keys = sorted(config['THRESHOLDS'].keys(), key=lambda x: int(x), reverse=True)

    def update(self, sensor_values):
        """Update state machine, returns current mode"""
        now = time.time()
        
        # 1. Determine "Instant" Target Mode based on current temperatures
        target_mode = '0' if '0' in self.config['TARGETS'] else '1'
        
        for mode in self.mode_keys:
            thresh = self.config['THRESHOLDS'][mode]
            triggered = False
            for source, limit in thresh.items():
                if limit is not None:
                    val = sensor_values.get(source, 0)
                    if val > limit:
                        triggered = True
                        break
            
            if triggered:
                target_mode = mode
                break
        
        # 2. Handle State Transitions
        if target_mode == self.current_mode:
            # Current state is stable, reset any pending transitions
            self.pending_mode = None
            self.status_msg = f"Stable Level {self.current_mode}"
            return self.current_mode

        # 3. Enforce Hold Time (Minimum time in current mode before any change is allowed)
        hold = self.config['HOLD_TIME'].get(self.current_mode, 30)
        time_since_change = now - self.last_mode_change_time
        if time_since_change < hold:
            self.pending_mode = None  # Reset pending if we are locked
            self.status_msg = f"Locked (Hold {hold - time_since_change:.0f}s)"
            return self.current_mode

        # 4. Confirmation Logic (Delay)
        # We only consider changing if the target_mode stays constant for Delay seconds
        delay = self.config['DELAY_UP']  # Using unified delay for both Up and Down
        
        if self.pending_mode != target_mode:
            # Target changed or first time seeing this target
            self.pending_mode = target_mode
            self.pending_start_time = now
            self.status_msg = f"Confirming Lvl{target_mode} ({delay}s)"
        else:
            # Still targeting the same pending mode
            elapsed = now - self.pending_start_time
            if elapsed >= delay:
                # Target confirmed!
                old_mode = self.current_mode
                self.current_mode = target_mode
                self.last_mode_change_time = now
                self.pending_mode = None
                
                direction = "Escalated" if int(self.current_mode) > int(old_mode) else "De-escalated"
                self.status_msg = f"{direction} to Lvl{self.current_mode}"
                # Also log to main logger if possible
            else:
                self.status_msg = f"Pending Lvl{target_mode} ({delay - elapsed:.1f}s)"
                
        return self.current_mode



