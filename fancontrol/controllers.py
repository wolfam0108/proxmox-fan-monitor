"""
Fan Controllers Module

Contains SystemFanController for PWM-controlled system fans 
and GPUFanController for NVIDIA GPU fans.
"""
import subprocess
import time

# Fan control constants
TOLERANCE = 30
PWM_MIN = 0
PWM_MAX = 255
STEP_SIZE = 2


class SystemFanController:
    """Controller for system fans via sysfs PWM interface"""
    
    def __init__(self, name, pwm_path, fan_input_path):
        self.name = name
        self.pwm_path = pwm_path
        self.fan_input_path = fan_input_path
        self.current_pwm = self.get_initial_pwm()
        self.current_rpm = 0
        self.target_rpm = 1200
        self.enable_manual_control()

    def get_initial_pwm(self):
        if not self.pwm_path:
            return 128
        try:
            with open(self.pwm_path, 'r') as f:
                return int(f.read().strip())
        except:
            return 128

    def enable_manual_control(self):
        try:
            with open(self.pwm_path + "_enable", 'w') as f:
                f.write('1')
        except:
            pass

    def get_rpm(self):
        try:
            with open(self.fan_input_path, 'r') as f:
                return int(f.read().strip())
        except:
            return 0

    def set_pwm(self, val):
        val = max(PWM_MIN, min(PWM_MAX, int(val)))
        try:
            with open(self.pwm_path, 'w') as f:
                f.write(str(val))
            self.current_pwm = val
        except:
            pass

    def update(self):
        self.current_rpm = self.get_rpm()
        error = self.target_rpm - self.current_rpm
        if abs(error) > TOLERANCE:
            step = STEP_SIZE
            if abs(error) > 200:
                step *= 2
            if error > 0:
                self.current_pwm += step
            else:
                self.current_pwm -= step
            self.set_pwm(self.current_pwm)


class GPUFanController:
    """Controller for NVIDIA GPU fans via nvidia-settings"""
    
    def __init__(self, gpu_config: dict = None):
        """
        Initialize GPU fan controller.
        
        Args:
            gpu_config: Optional configuration dict with:
                - display: X display (default ':0')
                - gpu_index: GPU index (default 0)
                - fans: List of fan indices (default [0, 1])
        """
        if gpu_config is None:
            gpu_config = {}
        
        self.display = gpu_config.get('display', ':0')
        self.gpu_index = gpu_config.get('gpu_index', 0)
        self.fan_indices = gpu_config.get('fans', [0, 1])
        
        self.current_pct = 0
        self.target_rpm = 0
        self.current_rpm = 0
        self.actual_pct = 0
        self.is_manual_active = False
        self.reset()

    def reset(self):
        """Forces GPU back to Driver/Auto Control"""
        try:
            subprocess.run(
                ['nvidia-settings', '-c', self.display, '-a', 
                 f'[gpu:{self.gpu_index}]/GPUFanControlState=0'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            self.is_manual_active = False
            self.current_pct = 0  # Reset so next set_target will reapply
        except:
            pass

    def set_speed_pct(self, target_pct):
        target_pct = max(0, min(100, int(target_pct)))
        
        # If target is 0, revert to Auto (Driver) control
        if target_pct == 0:
             self.reset()
             return

        if not self.is_manual_active:
            # Sync start point before enabling manual
            if self.actual_pct > 0:
                self.current_pct = self.actual_pct

        # Force Enable Manual Control EVERY TIME to ensure it sticks
        # Some drivers/cards might silently revert or need re-assertion
        subprocess.run(
            ['nvidia-settings', '-c', self.display, '-a', 
                f'[gpu:{self.gpu_index}]/GPUFanControlState=1'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        self.is_manual_active = True
        
        # Build command with all configured fans
        cmd = ['nvidia-settings', '-c', self.display]
        for fan_idx in self.fan_indices:
            cmd.extend(['-a', f'[fan:{fan_idx}]/GPUTargetFanSpeed={target_pct}'])
        
        # Log the change for debugging
        print(f"DEBUG: GPU Fan Setting {target_pct}%")
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.current_pct = target_pct

    def set_target_rpm(self, rpm):
        self.target_rpm = int(rpm)

    def set_pwm(self, val):
        """Standard interface: sets speed from pseudo-PWM (0-255)"""
        # Convert 0-255 to 0-100%
        pct = int((val / 255.0) * 100)
        self.set_speed_pct(pct)

    def get_rpm(self):
        try:
            from . import gpu_scanner
            # We need to query efficienty. This might be slow if called per fan.
            # Ideally getting all speeds at once is better, but for now:
            result = gpu_scanner.get_gpu_fan_speeds(
                self.gpu_index, 
                self.display, 
                self.fan_indices
            )
            # Return RPM of the first fan in this controller (usually 1:1 mapping now)
            if self.fan_indices:
                idx = self.fan_indices[0]
                data = result.get(idx, {})
                self.actual_pct = data.get('pct', 0)
                rpm = data.get('rpm', 0)
                self.current_rpm = rpm
                return rpm
            return 0
        except:
            return 0

    def update(self):
        """Update loop for RPM targeting"""
        self.current_rpm = self.get_rpm()
        
        # Sync current_pct with reality if we are not yet in manual mode
        # This prevents starting from 0% when the fan is actually at 60%
        if not self.is_manual_active:
            self.current_pct = self.actual_pct
            
        # If target RPM is set, use closed-loop control
        if self.target_rpm > 100: # Ignore small values, treat as 0 or manual %
             error = self.target_rpm - self.current_rpm
             
             # Tolerance +/- 50 RPM
             if abs(error) > 50:
                 # Calculate step
                 # If we are far off (>400 rpm), take bigger step
                 step = 1
                 if abs(error) > 400:
                     step = 5
                 elif abs(error) > 200:
                     step = 2
                     
                 if error > 0:
                     self.current_pct += step
                 else:
                     self.current_pct -= step
                 
                 # CLAMP: Prevent dropping below 20% in closed loop to avoid dead zone/stall
                 self.current_pct = max(20, min(100, self.current_pct))
                     
                 self.set_speed_pct(self.current_pct)
        
        # If target RPM is 0 but we have a manual % set via other means, just keep it.
        # But if we want to support "Auto" mode (target=0), we should check that.
        elif self.target_rpm == 0 and self.is_manual_active:
             # Check if we should revert to auto? 
             # For now, let fan_control.py call reset() if target is 0.
             pass

