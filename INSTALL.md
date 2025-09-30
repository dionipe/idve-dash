# IDVE Dashboard - Installation Guide

IDVE Dashboard is a web-based virtual machine management system built with Node.js, Express, and QEMU/KVM.

## Supported Operating Systems

This guide covers installation on:
- **Debian 11/12/13** - 📖 [Detailed Debian Guide](DEBIAN-DEPENDENCIES.md) | 🚀 [Automated Script](install-debian.sh)
- Ubuntu 20.04/22.04/24.04
- Rocky Linux 8/9
- CentOS 7/8 (Stream)

> **Note**: For Debian systems, use the [automated installation script](install-debian.sh) for a complete hands-free setup, or follow the [detailed Debian guide](DEBIAN-DEPENDENCIES.md)

## System Requirements

### Minimum Requirements
- CPU: 2 cores
- RAM: 4GB
- Storage: 20GB free space
- Network: Bridge-capable network interface

### Recommended Requirements
- CPU: 4+ cores
- RAM: 8GB+
- Storage: 100GB+ SSD
- Network: Dedicated bridge interface

## Pre-Installation Setup

### 1. Update System
```bash
# Debian/Ubuntu
sudo apt update && sudo apt upgrade -y

# Rocky Linux/CentOS
sudo dnf update -y
# or for CentOS 7
sudo yum update -y
```

### 2. Install Basic Dependencies
```bash
# Debian/Ubuntu
sudo apt install -y curl wget git vim htop

# Rocky Linux/CentOS
sudo dnf install -y curl wget git vim htop
# or for CentOS 7
sudo yum install -y curl wget git vim htop
```

## KVM/QEMU Installation

### Debian/Ubuntu
```bash
# Install QEMU and KVM
sudo apt install -y qemu-kvm qemu-system-x86 qemu-utils ovmf bridge-utils

# Install websockify for VNC proxy
sudo apt install -y websockify

# Add user to kvm group
sudo usermod -aG kvm $USER
```

### Rocky Linux/CentOS
```bash
# Install QEMU and KVM
sudo dnf install -y qemu-kvm qemu-system-x86 qemu-img ovmf bridge-utils

# For CentOS 7, use yum
# sudo yum install -y qemu-kvm qemu-system-x86 qemu-img bridge-utils

# Install websockify for VNC proxy
# Option 1: From package (if available)
sudo dnf install -y websockify

# Option 2: From pip (recommended for CentOS)
sudo pip3 install websockify

# Add user to kvm group
sudo usermod -aG kvm $USER
```

## Network Bridge Configuration

### 1. Identify Network Interface
```bash
ip addr show
# Note your main interface (usually ens18, ens19, eth0, etc.)
```

### 2. Create Bridge Configuration

#### Debian/Ubuntu (/etc/network/interfaces)
```bash
# Backup original interfaces
sudo cp /etc/network/interfaces /etc/network/interfaces.backup

# Edit interfaces file
sudo vim /etc/network/interfaces

# Add the following (replace ens19 with your interface):
auto ens19
iface ens19 inet manual

auto vmbr0
iface vmbr0 inet static
    address 192.168.203.10/24  # Adjust IP as needed
    gateway 192.168.203.1      # Adjust gateway as needed
    bridge-ports ens19
    bridge-stp off
    bridge-fd 0
    dns-nameservers 8.8.8.8 8.8.4.4

auto vmbr1
iface vmbr1 inet manual
    bridge-ports ens18         # Optional: second bridge
    bridge-stp off
    bridge-fd 0
```

#### Rocky Linux/CentOS (/etc/sysconfig/network-scripts/)
```bash
# Create bridge configuration files

# Main interface (replace ens19 with your interface)
sudo vim /etc/sysconfig/network-scripts/ifcfg-ens19
# Content:
TYPE=Ethernet
BOOTPROTO=none
NAME=ens19
DEVICE=ens19
ONBOOT=yes
BRIDGE=vmbr0

# Bridge vmbr0
sudo vim /etc/sysconfig/network-scripts/ifcfg-vmbr0
# Content:
TYPE=Bridge
BOOTPROTO=static
NAME=vmbr0
DEVICE=vmbr0
ONBOOT=yes
IPADDR=192.168.203.10
NETMASK=255.255.255.0
GATEWAY=192.168.203.1
DNS1=8.8.8.8
DNS2=8.8.4.4
STP=no
DELAY=0

# Optional: Second bridge vmbr1
sudo vim /etc/sysconfig/network-scripts/ifcfg-vmbr1
# Content:
TYPE=Bridge
BOOTPROTO=none
NAME=vmbr1
DEVICE=vmbr1
ONBOOT=yes
STP=no
DELAY=0
```

### 3. Apply Network Changes
```bash
# Debian/Ubuntu
sudo systemctl restart networking

# Rocky Linux/CentOS
sudo systemctl restart network
# or
sudo nmcli connection reload
```

### 4. Verify Bridge
```bash
# Check bridge status
brctl show

# Check IP addresses
ip addr show

# Test connectivity
ping 8.8.8.8
```

## Node.js Installation

### Option 1: Using NodeSource Repository (Recommended)
```bash
# Install Node.js 18.x LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Debian/Ubuntu
sudo apt-get install -y nodejs

# Rocky Linux/CentOS
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs
# or for CentOS 7
sudo yum install -y nodejs
```

### Option 2: Using Package Manager
```bash
# Debian/Ubuntu
sudo apt install -y nodejs npm

# Rocky Linux/CentOS 8+
sudo dnf install -y nodejs npm

# CentOS 7
curl -sL https://rpm.nodesource.com/setup_16.x | bash -
sudo yum install -y nodejs
```

### Verify Installation
```bash
node --version
npm --version
```

## IDVE Dashboard Installation

### 1. Clone Repository
```bash
cd /opt
sudo git clone https://repo.indobsd.id/dionipe/idve-dash.git
sudo chown -R $USER:$USER idve-dash
cd idve-dash
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Create Required Directories
```bash
sudo mkdir -p /etc/idve
sudo mkdir -p /var/lib/idve/instances
sudo mkdir -p /var/lib/idve/isos
sudo mkdir -p /var/lib/idve/storages
sudo mkdir -p /var/log

# Set permissions
sudo chown -R $USER:$USER /etc/idve
sudo chown -R $USER:$USER /var/lib/idve
```

### 4. Configure Firewall

#### UFW (Debian/Ubuntu)
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 5900:5999/tcp  # VNC ports
sudo ufw --force enable
```

#### firewalld (Rocky Linux/CentOS)
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=5900-5999/tcp
sudo firewall-cmd --reload
```

### 5. Create Systemd Service
```bash
sudo vim /etc/systemd/system/idve-dash.service
```

Add the following content:
```ini
[Unit]
Description=IDVE Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/idve-dash
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=file:/var/log/idve-dash.log
StandardError=file:/var/log/idve-dash.log

[Install]
WantedBy=multi-user.target
```

### 6. Enable and Start Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable idve-dash
sudo systemctl start idve-dash
sudo systemctl status idve-dash
```

### 7. Verify Installation
```bash
# Check service status
sudo systemctl status idve-dash

# Check logs
tail -f /var/log/idve-dash.log

# Test web interface
curl http://localhost:3000
```

## Post-Installation Configuration

### 1. Access Web Interface
Open your browser and navigate to: `http://your-server-ip:3000`

### 2. Initial Setup
- Create your first network bridge through the web interface
- Upload ISO files to `/var/lib/idve/isos/`
- Create your first virtual machine
- Verify websockify is working for VNC connections

### 3. Security Considerations
```bash
# Change default passwords
# Configure SSL/TLS if needed
# Restrict SSH access
# Regular backups of /etc/idve/ and /var/lib/idve/
```

### 4. Monitoring
```bash
# Check logs
tail -f /var/log/idve-dash.log

# Monitor VM processes
ps aux | grep qemu

# Check bridge status
brctl show

# Check websockify processes
ps aux | grep websockify
```

## Troubleshooting

### Common Issues

#### 1. Bridge not working
```bash
# Check bridge configuration
brctl show

# Restart networking
sudo systemctl restart networking  # Debian/Ubuntu
sudo systemctl restart network     # CentOS/Rocky
```

#### 2. QEMU permission denied
```bash
# Add user to groups
sudo usermod -aG libvirt,kvm $USER

# Restart session or reboot
```

#### 3. Service not starting
```bash
# Check logs
sudo journalctl -u idve-dash -f
```

#### 4. Web interface not accessible
```bash
# Check firewall
sudo ufw status  # Debian/Ubuntu
sudo firewall-cmd --list-all  # CentOS/Rocky

# Check service
sudo systemctl status idve-dash
```

#### 5. VNC connection issues
```bash
# Check if websockify is installed
which websockify

# Check VNC ports
netstat -tlnp | grep :590
```

## Backup and Restore

### Backup
```bash
# Stop service
sudo systemctl stop idve-dash

# Backup configurations
tar -czf idve-backup-$(date +%Y%m%d).tar.gz /etc/idve /var/lib/idve

# Start service
sudo systemctl start idve-dash
```

### Restore
```bash
# Stop service
sudo systemctl stop idve-dash

# Restore files
tar -xzf idve-backup-*.tar.gz -C /

# Start service
sudo systemctl start idve-dash
```

## Support

For issues and questions:
- Check the logs: `/var/log/idve-dash.log`
- Verify system requirements
- Ensure all dependencies are installed
- Check network bridge configuration

## Important Notes

- IDVE Dashboard uses direct QEMU/KVM without libvirt daemon
- Websockify is required for VNC proxy functionality
- Bridge networking provides DHCP from router (192.168.203.0/24 range)
- All VM configurations are stored in JSON format in `/etc/idve/`
- VM disk images are stored in `/var/lib/idve/instances/`

## Changelog

### v1.2.0 (Latest)
- Fixed VM networking to use proper bridge instead of user networking
- Fixed undefined instance ID issue
- Added dynamic CD/DVD drive management
- Improved validation and error handling
- Updated installation guide to remove libvirt dependencies
- Added websockify installation for VNC proxy</content>
<parameter name="filePath">/opt/idve-dash/INSTALL.md

## Dependencies
- genisoimage, swtpm, websockify