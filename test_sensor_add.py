
import requests
import json
import time

url = 'http://localhost:8080/api/sensors'
data = {
    "id": "test_sensor_debug",
    "name": "Debug Sensor",
    "type": "hwmon",
    "visual_preset": "system",
    "paths": ["/sys/class/hwmon/hwmon0/temp1_input"]
}

try:
    print(f"Sending POST to {url}...")
    resp = requests.post(url, json=data)
    print("Status:", resp.status_code)
    print("Response:", resp.text)
    
    if resp.status_code == 200:
        print("Success. Checking file...")
        with open('/root/monitor/fan_config.json', 'r') as f:
            print(f.read())
    else:
        print("Failed.")

except Exception as e:
    print("Error:", e)
