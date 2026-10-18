#!/bin/bash
# Convenient portable runner for TSViT Web App
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$DIR/.venv/bin/python" ]; then
    PYTHON_CMD="$DIR/.venv/bin/python"
elif [ -f "/home/chuonglv/.venv/bin/python" ]; then
    PYTHON_CMD="/home/chuonglv/.venv/bin/python"
else
    PYTHON_CMD="python3"
fi

exec $PYTHON_CMD "$DIR/webapp/server.py" "$@"

