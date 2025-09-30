# IDVE Dashboard - Automated Debian Installation

## 🚀 **Automated Installation Script**

Script `install-debian.sh` menyediakan instalasi otomatis lengkap IDVE Dashboard untuk sistem Debian.

## 📋 **Fitur Utama**

- ✅ **Verifikasi sistem** - Cek kompatibilitas dan requirements
- ✅ **Update sistem** - Update semua paket sistem
- ✅ **Instalasi KVM/QEMU** - Stack virtualisasi lengkap
- ✅ **Konfigurasi jaringan** - Setup bridge otomatis
- ✅ **Instalasi Node.js** - Node.js 18+ dari NodeSource
- ✅ **Persiapan direktori** - Buat semua direktori yang dibutuhkan
- ✅ **Instalasi IDVE** - Clone dan setup aplikasi
- ✅ **Konfigurasi service** - Systemd service otomatis
- ✅ **Verifikasi instalasi** - Cek semua komponen
- ✅ **Startup service** - Jalankan service secara otomatis

## 🛠️ **Cara Penggunaan**

### Instalasi Dasar (dengan repository default)
```bash
sudo ./install-debian.sh
```

### Instalasi dengan Repository Kustom
```bash
sudo ./install-debian.sh --git-repo=https://github.com/username/idve-dash.git
```

### Lihat Bantuan
```bash
./install-debian.sh --help
```

## 📊 **Proses Instalasi**

Script akan menjalankan langkah-langkah berikut secara otomatis:

1. **Verifikasi Root Access** - Pastikan script dijalankan sebagai root
2. **Cek Sistem** - Verifikasi OS, arsitektur, RAM, dan disk space
3. **Update Sistem** - Update semua paket Debian
4. **Install Dependencies** - Install paket dasar (curl, wget, git, dll.)
5. **Setup KVM/QEMU** - Install stack virtualisasi lengkap
6. **Konfigurasi Jaringan** - Setup bridge otomatis berdasarkan interface yang ada
7. **Install Node.js** - Install Node.js 18+ dari repository resmi
8. **Buat Direktori** - Setup semua direktori IDVE dengan permissions benar
9. **Install IDVE Dashboard** - Clone repository dan install dependencies
10. **Konfigurasi Service** - Buat dan enable systemd service
11. **Verifikasi** - Cek semua komponen terinstall dengan benar
12. **Startup** - Jalankan service dan tampilkan informasi akses

## ⚙️ **Konfigurasi Otomatis**

### Network Bridges
Script akan otomatis mendeteksi interface jaringan dan membuat:
- **vmbr0** - Bridge utama dengan DHCP
- **vmbr1** - Bridge sekunder (jika ada interface kedua)

### Systemd Service
Service akan dikonfigurasi dengan:
- Auto-restart pada failure
- Logging ke `/var/log/idve-dash.log`
- User yang menjalankan script
- Environment production

## 📁 **File yang Dibuat/Dimodifikasi**

### Direktori Baru
```
/etc/idve/                    # Konfigurasi VM
/var/lib/idve/instances/      # VM instances
/var/lib/idve/isos/           # ISO images
/var/lib/idve/images/         # VM disk images
/var/lib/idve/cloudinit/      # Cloud-init data
/var/run/idve/cloudinit/      # Runtime data
```

### File Konfigurasi
```
/etc/network/interfaces       # Network configuration (backup otomatis)
/etc/systemd/system/idve-dash.service  # Systemd service
/var/log/idve-install.log     # Installation log
```

## 🔍 **Verifikasi Pasca-Instalasi**

Setelah instalasi, script akan menampilkan informasi berikut:

```
==================================================================
🎉 IDVE Dashboard Installation Completed!
==================================================================

📊 Service Status:
  sudo systemctl status idve-dash

🌐 Web Interface:
  http://192.168.203.10:3000

📝 Log Files:
  Application: /var/log/idve-dash.log
  Installation: /var/log/idve-install.log

🔧 Management Commands:
  Start:   sudo systemctl start idve-dash
  Stop:    sudo systemctl stop idve-dash
  Restart: sudo systemctl restart idve-dash
  Logs:    sudo journalctl -u idve-dash -f
```

## 🛑 **Troubleshooting**

### Script Tidak Bisa Dijalankan
```bash
# Pastikan executable
chmod +x install-debian.sh

# Jalankan sebagai root
sudo ./install-debian.sh
```

### Instalasi Gagal di Tengah Jalan
```bash
# Cek log instalasi
cat /var/log/idve-install.log

# Lanjutkan manual dari langkah yang gagal
# Ikuti panduan di DEBIAN-DEPENDENCIES.md
```

### Service Tidak Start
```bash
# Cek status service
sudo systemctl status idve-dash

# Cek logs aplikasi
sudo journalctl -u idve-dash -f

# Cek port 3000
sudo netstat -tlnp | grep :3000
```

### Repository Tidak Dapat Diakses
Jika repository git tidak dapat diakses, script akan membuat direktori kosong.
Anda perlu menyalin file IDVE Dashboard secara manual ke `/opt/idve-dash/`.

## 🔄 **Re-run Script**

Script dapat dijalankan ulang dengan aman. Jika ada komponen yang sudah terinstall,
script akan melewatinya atau melakukan upgrade.

## 📋 **Requirements Sistem**

- **OS**: Debian 11, 12, atau 13
- **Arsitektur**: x86_64
- **RAM**: Minimum 4GB (8GB+ recommended)
- **Disk**: Minimum 20GB free space
- **Network**: Interface Ethernet untuk bridge
- **Root Access**: Diperlukan untuk instalasi

## 🎯 **Status**

✅ **TERVERIFIKASI** - Script ini dibuat berdasarkan instalasi manual yang berhasil dan telah ditest pada Debian 13.

---

**Versi**: 1.0.0
**Tanggal**: September 30, 2025
**Kompatibilitas**: Debian 11/12/13</content>
<parameter name="filePath">/opt/idve-dash/AUTOMATION-README.md