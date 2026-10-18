#!/usr/bin/env bash
# ==============================================================================
# TSViT WebApp - AWS EC2 Free Tier Automated Deployment Script
# Tested on: Ubuntu 22.04 LTS / 24.04 LTS (t2.micro / t3.micro)
# ==============================================================================

set -e

echo "=========================================================="
echo "🚀 Starting TSViT Crop Map Deployment on AWS EC2 Free Tier"
echo "=========================================================="

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=80

# 1. Enable 2GB Swap Memory (Crucial for 1GB RAM on t2.micro)
if [ ! -f /swapfile ]; then
    echo "📦 Configuring 2GB Swap Memory for 1GB RAM Free Tier..."
    sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ Swap memory configured."
else
    echo "ℹ️ Swap file already exists."
fi

# 2. Update System Packages
echo "🔄 Updating system packages..."
sudo apt-get update -y
sudo apt-get install -y python3 python3-pip python3-venv curl git

# 3. Setup Python Virtual Environment
VENV_DIR="${APP_DIR}/.venv"
if [ ! -d "${VENV_DIR}" ]; then
    echo "🐍 Creating virtual environment in ${VENV_DIR}..."
    python3 -m venv "${VENV_DIR}"
fi

# 4. Install Dependencies
echo "📥 Installing lightweight PyTorch (CPU) and dependencies..."
"${VENV_DIR}/bin/pip" install --upgrade pip
"${VENV_DIR}/bin/pip" install torch --index-url https://download.pytorch.org/whl/cpu
"${VENV_DIR}/bin/pip" install -r "${APP_DIR}/requirements.txt"

# 5. Allow Python to bind to privileged Port 80
echo "🔓 Permitting Python to bind to port ${PORT}..."
sudo setcap 'cap_net_bind_service=+ep' "${VENV_DIR}/bin/python3" || true

# 6. Configure Systemd Service
SERVICE_FILE="/etc/systemd/system/tsvit-cropmap.service"
echo "⚙️ Creating systemd service: ${SERVICE_FILE}..."
sudo bash -c "cat <<EOF > ${SERVICE_FILE}
[Unit]
Description=TSViT Crop Classification Service
After=network.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${APP_DIR}
ExecStart=${VENV_DIR}/bin/python ${APP_DIR}/run_app.py ${PORT}
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF"

# 7. Enable and Start Service
echo "🚀 Starting TSViT service..."
sudo systemctl daemon-reload
sudo systemctl enable tsvit-cropmap
sudo systemctl restart tsvit-cropmap

# 8. Check Status
sleep 2
if sudo systemctl is-active --quiet tsvit-cropmap; then
    PUBLIC_IP=$(curl -s http://checkip.amazonaws.com || curl -s ifconfig.me || echo "YOUR-EC2-PUBLIC-IP")
    echo "=========================================================="
    echo "🎉 DEPLOYMENT SUCCESSFUL!"
    echo "🌐 Access your app at: http://${PUBLIC_IP}"
    echo "📋 Check service logs with: sudo journalctl -u tsvit-cropmap -f"
    echo "=========================================================="
else
    echo "❌ Service failed to start. Logs:"
    sudo journalctl -u tsvit-cropmap -n 25 --no-pager
    exit 1
fi
