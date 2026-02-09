import subprocess

def check_nvidia_driver():
    """
    Check if NVIDIA driver is available and working.
    Returns:
        bool: True if driver is available and nvidia-smi works
        int: Number of GPUs found (0 if driver not available)
    """
    try:
        # Check nvidia-smi presence and functionality
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=count', '--format=csv,noheader'],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=2
        )
        
        if result.returncode == 0:
            try:
                count = int(result.stdout.decode().strip())
                return True, count
            except:
                return True, 0
                
        return False, 0
        
    except FileNotFoundError:
        return False, 0
    except Exception:
        return False, 0


def check_service_status(service_name):
    """
    Check if a systemd service is active.
    Returns:
        bool: True if active, False otherwise
        str: Detailed status string
    """
    try:
        result = subprocess.run(
            ['systemctl', 'is-active', service_name],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=2
        )
        status = result.stdout.strip()
        return status == 'active', status
    except:
        return False, 'error'


def is_x_server_available(display=":0"):
    """
    Check if X server is accessible.
    """
    try:
        # Check if xdpyinfo or similar is available or use nvidia-settings -q
        result = subprocess.run(
            ['nvidia-settings', '-c', display, '-q', 'GPUCoreTemp'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2
        )
        return result.returncode == 0
    except:
        return False
