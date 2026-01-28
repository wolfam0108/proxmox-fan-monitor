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
