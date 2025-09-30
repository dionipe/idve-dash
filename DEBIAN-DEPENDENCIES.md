# IDVE Dashboard - Debian Dependencies Guide

## 📋 **Panduan Instalasi Lengkap untuk Debian**

Dokumen ini berisi panduan instalasi lengkap IDVE Dashboard pada sistem Debian, berdasarkan konfigurasi sistem yang telah terverifikasi berfungsi dengan baik.

### 🎯 **Sistem Operasi yang Didukung**
- **Debian 11 (Bullseye)**
- **Debian 12 (Bookworm)**
- **Debian 13 (Trixie)** - ✅ **Direkomendasikan**

### 💻 **Persyaratan Sistem Minimum**
- **CPU**: 2 core (4+ direkomendasikan)
- **RAM**: 4GB (8GB+ direkomendasikan)
- **Storage**: 20GB free (100GB+ SSD direkomendasikan)
- **Arsitektur**: x86_64 only
- **Kernel**: Linux 4.0+ dengan dukungan KVM

## 🔧 **1. Persiapan Sistem**

### Update Sistem
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Dependencies Dasar
```bash
sudo apt install -y curl wget git vim htop net-tools
```

## 🖥️ **2. Instalasi KVM/QEMU Stack**

### Paket Utama Virtualisasi
```bash
# Install QEMU dan KVM lengkap
sudo apt install -y qemu-kvm qemu-system-x86 qemu-utils qemu-system-gui \
                   qemu-system-modules-opengl qemu-system-modules-spice \
                   qemu-system-common qemu-system-data qemu-block-extra \
                   qemu-guest-agent ovmf ovmf-ia32

# Install bridge utilities untuk networking
sudo apt install -y bridge-utils

# Install websockify untuk VNC WebSocket proxy
sudo apt install -y websockify python3-websockify

# Verifikasi instalasi
kvm-ok
```

### Konfigurasi User KVM
```bash
# Tambahkan user ke group kvm
sudo usermod -aG kvm $USER

# Verifikasi KVM modules
lsmod | grep kvm
```

## 🌐 **3. Konfigurasi Network Bridge**

### Identifikasi Interface Jaringan
```bash
ip addr show
# Catat interface utama (biasanya ens18, ens19, eth0, dll)
```

### Konfigurasi Bridge di `/etc/network/interfaces`
```bash
# Backup konfigurasi asli
sudo cp /etc/network/interfaces /etc/network/interfaces.backup

# Edit file interfaces
sudo vim /etc/network/interfaces
```

**Contoh konfigurasi lengkap:**
```bash
# This file describes the network interfaces available on your system
# and how to activate them. For more information, see interfaces(5).

source /etc/network/interfaces.d/*

# The loopback network interface
auto lo
iface lo inet loopback

# Primary network interface (bridged)
auto ens18
iface ens18 inet manual

# Main bridge for VM networking
auto vmbr0
iface vmbr0 inet static
    address 192.168.203.10/24
    gateway 192.168.203.1
    bridge-ports ens18
    bridge-stp off
    bridge-fd 0
    dns-nameservers 8.8.8.8 8.8.4.4

# Secondary bridge (optional)
auto ens19
iface ens19 inet manual

auto vmbr1
iface vmbr1 inet manual
    bridge-ports ens19
    bridge-stp off
    bridge-fd 0
```

### Restart Networking
```bash
sudo systemctl restart networking
# atau
sudo ifdown -a && sudo ifup -a
```

### Verifikasi Bridge
```bash
ip addr show | grep br
brctl show
```

## 🟢 **4. Instalasi Node.js dan NPM**

### Install Node.js 18+ (LTS)
```bash
# Install dari NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifikasi versi
node --version  # Harus 18.x atau lebih tinggi
npm --version   # Harus 9.x atau lebih tinggi
```

## 📁 **5. Persiapan Direktori IDVE**

### Buat Struktur Direktori
```bash
# Direktori konfigurasi
sudo mkdir -p /etc/idve

# Direktori data utama
sudo mkdir -p /var/lib/idve/instances
sudo mkdir -p /var/lib/idve/isos
sudo mkdir -p /var/lib/idve/images
sudo mkdir -p /var/lib/idve/cloudinit
sudo mkdir -p /var/lib/idve/cloudinit-templates
sudo mkdir -p /var/lib/idve/lxc-templates
sudo mkdir -p /var/lib/idve/tpm

# Direktori runtime
sudo mkdir -p /var/run/idve/cloudinit

# Direktori log
sudo mkdir -p /var/log
```

### Set Permissions
```bash
# Set ownership (sesuaikan dengan user yang akan menjalankan)
sudo chown -R $USER:$USER /etc/idve
sudo chown -R $USER:$USER /var/lib/idve
sudo chown -R $USER:$USER /var/run/idve
sudo chown -R $USER:$USER /var/log/idve-dash.log
```

## 📦 **6. Instalasi IDVE Dashboard**

### Clone atau Download Source Code
```bash
cd /opt
sudo git clone https://github.com/username/idve-dash.git
# atau download dan extract ke /opt/idve-dash

cd /opt/idve-dash
```

### Install Dependencies Node.js
```bash
npm install
```

### Verifikasi Dependencies
```bash
npm list --depth=0
```

## 🚀 **7. Konfigurasi dan Startup**

### Test Server
```bash
# Test startup (akan gagal jika port 3000 sudah digunakan)
timeout 5s npm start || echo "Server test completed"
```

### Konfigurasi Service (Opsional)
```bash
# Buat systemd service
sudo vim /etc/systemd/system/idve-dash.service
```

**Isi file service:**
```ini
[Unit]
Description=IDVE Dashboard
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/opt/idve-dash
ExecStart=/usr/bin/node /opt/idve-dash/server.js
Restart=always
RestartSec=10
StandardOutput=file:/var/log/idve-dash.log
StandardError=file:/var/log/idve-dash.log

[Install]
WantedBy=multi-user.target
```

```bash
# Enable dan start service
sudo systemctl daemon-reload
sudo systemctl enable idve-dash
sudo systemctl start idve-dash
sudo systemctl status idve-dash
```

## 🔍 **8. Verifikasi Instalasi**

### Cek Status Sistem
```bash
# KVM modules
lsmod | grep kvm

# QEMU versi
qemu-system-x86_64 --version

# Bridge status
brctl show

# Node.js
node --version && npm --version

# Web server
curl -s http://localhost:3000 | head -5
```

### Cek System Monitoring
```bash
# CPU usage
top -bn1 | grep "Cpu(s)" | sed 's/.*, *\([0-9.]*\)%* id.*/\1/' | awk '{print 100 - $1}'

# Memory info
free -m | awk 'NR==2{printf "%.0f %.0f", $3, $2}'

# Disk usage
df / | awk 'NR==2{printf "%.0f %.0f", $3, $2}'

# CPU info
nproc && grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | sed 's/^ *//'
```

## 📋 **9. Troubleshooting**

### Masalah Umum dan Solusi

#### KVM tidak aktif
```bash
# Cek virtualisasi di BIOS
sudo apt install -y cpu-checker
kvm-ok

# Load KVM modules manual
sudo modprobe kvm
sudo modprobe kvm_intel  # atau kvm_amd
```

#### Bridge tidak berfungsi
```bash
# Restart networking
sudo systemctl restart networking

# Cek konfigurasi
cat /etc/network/interfaces
ip addr show
```

#### Node.js dependencies gagal
```bash
# Clear cache dan reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### Port 3000 sudah digunakan
```bash
# Cek proses yang menggunakan port
sudo netstat -tlnp | grep :3000
sudo fuser -k 3000/tcp
```

## 📊 **10. Monitoring dan Maintenance**

### Log Files
```bash
# Application logs
tail -f /var/log/idve-dash.log

# System logs
journalctl -u idve-dash -f
```

### Backup Konfigurasi
```bash
# Backup VM configurations
tar -czf idve-config-backup.tar.gz /etc/idve/

# Backup data
tar -czf idve-data-backup.tar.gz /var/lib/idve/
```

### Update Sistem
```bash
# Update IDVE Dashboard
cd /opt/idve-dash
git pull
npm install
sudo systemctl restart idve-dash

# Update sistem
sudo apt update && sudo apt upgrade -y
```

## ✅ **Checklist Instalasi**

- [ ] Sistem Debian terbaru terinstall
- [ ] KVM/QEMU stack lengkap terinstall
- [ ] Network bridge dikonfigurasi
- [ ] Node.js 18+ terinstall
- [ ] Direktori IDVE dibuat dengan permissions benar
- [ ] IDVE Dashboard terinstall dan dependencies terpenuhi
- [ ] Server dapat start tanpa error
- [ ] Web interface accessible di port 3000
- [ ] System monitoring berfungsi
- [ ] VM creation dan management dapat dilakukan

---

**Status**: ✅ **TERVERIFIKASI** - Panduan ini dibuat berdasarkan instalasi yang berhasil pada Debian 13 dengan semua komponen berfungsi normal.