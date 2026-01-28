"""
Fan Control Web Module
"""
from .server import (
    FanControlHandler,
    start_http_server,
    current_state,
    history_logger,
    LOG_INTERVAL,
    get_history_from_logs
)
