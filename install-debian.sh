#!/bin/bash

# IDVE Dashboard - Automated Debian Installation Script
# Version: 1.0.0
# Date: September 30, 2025
# Author: IDVE Team

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
LOG_FILE="/var/log/idve-install.log"
IDVE_DIR="/opt/idve-dash"
CONFIG_DIR="/etc/idve"
DATA_DIR="/var/lib/idve"
RUN_DIR="/var/run/idve"
LOG_DIR="/var/log"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to log messages
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root. Use: sudo $0"
        exit 1
    fi
}

# Function to check system requirements
check_system() {
    print_status "Checking system requirements..."

    # Check OS
    if ! grep -q "Debian" /etc/os-release; then
        print_error "This script is designed for Debian systems only."
        exit 1
    fi

    # Check architecture
    if [[ $(uname -m) != "x86_64" ]]; then
        print_error "This script requires x86_64 architecture."
        exit 1
    fi

    # Check available memory
    TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    if [[ $TOTAL_MEM -lt 4096 ]]; then
        print_warning "System has ${TOTAL_MEM}MB RAM. Minimum recommended is 4096MB."
    fi

    # Check available disk space
    AVAILABLE_SPACE=$(df / | awk 'NR==2{printf "%.0f", $4}')
    if [[ $AVAILABLE_SPACE -lt 20480 ]]; then
        print_error "Insufficient disk space. Need at least 20GB free space."
        exit 1
    fi

    print_success "System requirements check passed."
}

# Function to update system
update_system() {
    print_status "Updating system packages..."
    log "Updating system packages"

    apt update >> "$LOG_FILE" 2>&1
    apt upgrade -y >> "$LOG_FILE" 2>&1
    apt autoremove -y >> "$LOG_FILE" 2>&1

    print_success "System updated successfully."
}

# Function to install basic dependencies
install_basic_deps() {
    print_status "Installing basic dependencies..."
    log "Installing basic dependencies"

    apt install -y curl wget git vim htop net-tools apt-transport-https \
                  ca-certificates gnupg lsb-release software-properties-common \
                  cpu-checker >> "$LOG_FILE" 2>&1

    print_success "Basic dependencies installed."
}

# Function to install KVM/QEMU stack
install_kvm_qemu() {
    print_status "Installing KVM/QEMU virtualization stack..."
    log "Installing KVM/QEMU stack"

    # Install QEMU and KVM packages
    apt install -y qemu-kvm qemu-system-x86 qemu-utils qemu-system-gui \
                   qemu-system-modules-opengl qemu-system-modules-spice \
                   qemu-system-common qemu-system-data qemu-block-extra \
                   qemu-guest-agent ovmf ovmf-ia32 bridge-utils \
                   websockify python3-websockify >> "$LOG_FILE" 2>&1

    # Add user to kvm group
    usermod -aG kvm "$SUDO_USER" 2>/dev/null || usermod -aG kvm root

    # Load KVM modules
    modprobe kvm 2>/dev/null || true
    modprobe kvm_intel 2>/dev/null || modprobe kvm_amd 2>/dev/null || true

    # Verify KVM
    if kvm-ok 2>/dev/null; then
        print_success "KVM/QEMU stack installed successfully."
    else
        print_warning "KVM may not be available. Check BIOS settings for virtualization support."
    fi
}

# Function to configure network bridges
configure_network() {
    print_status "Configuring network bridges..."
    log "Configuring network bridges"

    # Detect network interfaces
    INTERFACES=$(ip link show | grep -E "^[0-9]+: (en|eth)" | cut -d: -f2 | sed 's/@.*//' | tr -d ' ')

    if [[ -z "$INTERFACES" ]]; then
        print_warning "No Ethernet interfaces detected. Manual network configuration may be required."
        return
    fi

    # Use first interface for main bridge
    PRIMARY_IF=$(echo "$INTERFACES" | head -1)
    SECONDARY_IF=$(echo "$INTERFACES" | sed -n '2p')

    print_status "Detected interfaces: $INTERFACES"
    print_status "Using $PRIMARY_IF for vmbr0"

    # Backup existing interfaces
    cp /etc/network/interfaces /etc/network/interfaces.backup.$(date +%Y%m%d_%H%M%S)

    # Create new interfaces configuration
    cat > /etc/network/interfaces << EOF
# This file describes the network interfaces available on your system
# and how to activate them. For more information, see interfaces(5).

source /etc/network/interfaces.d/*

# The loopback network interface
auto lo
iface lo inet loopback

# Primary network interface (bridged)
auto $PRIMARY_IF
iface $PRIMARY_IF inet manual

# Main bridge for VM networking
auto vmbr0
iface vmbr0 inet dhcp
    bridge-ports $PRIMARY_IF
    bridge-stp off
    bridge-fd 0

EOF

    # Add secondary bridge if available
    if [[ -n "$SECONDARY_IF" ]]; then
        print_status "Using $SECONDARY_IF for vmbr1"
        cat >> /etc/network/interfaces << EOF
# Secondary network interface (bridged)
auto $SECONDARY_IF
iface $SECONDARY_IF inet manual

auto vmbr1
iface vmbr1 inet manual
    bridge-ports $SECONDARY_IF
    bridge-stp off
    bridge-fd 0

EOF
    fi

    # Restart networking
    systemctl restart networking >> "$LOG_FILE" 2>&1 || true

    print_success "Network bridges configured."
}

# Function to install Node.js
install_nodejs() {
    print_status "Installing Node.js 18+..."
    log "Installing Node.js"

    # Install Node.js from NodeSource
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - >> "$LOG_FILE" 2>&1
    apt-get install -y nodejs >> "$LOG_FILE" 2>&1

    # Verify installation
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $NODE_VERSION -ge 18 ]]; then
        print_success "Node.js $(node --version) installed successfully."
    else
        print_error "Failed to install Node.js 18+. Current version: $(node --version)"
        exit 1
    fi
}

# Function to create directories
create_directories() {
    print_status "Creating IDVE directories..."
    log "Creating directories"

    # Create all necessary directories
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DATA_DIR/instances"
    mkdir -p "$DATA_DIR/isos"
    mkdir -p "$DATA_DIR/images"
    mkdir -p "$DATA_DIR/cloudinit"
    mkdir -p "$DATA_DIR/cloudinit-templates"
    mkdir -p "$DATA_DIR/lxc-templates"
    mkdir -p "$DATA_DIR/tpm"
    mkdir -p "$RUN_DIR/cloudinit"

    # Set permissions
    chown -R "$SUDO_USER:$SUDO_USER" "$CONFIG_DIR" 2>/dev/null || chown -R root:root "$CONFIG_DIR"
    chown -R "$SUDO_USER:$SUDO_USER" "$DATA_DIR" 2>/dev/null || chown -R root:root "$DATA_DIR"
    chown -R "$SUDO_USER:$SUDO_USER" "$RUN_DIR" 2>/dev/null || chown -R root:root "$RUN_DIR"

    print_success "Directories created successfully."
}

# Function to install IDVE Dashboard
install_idve() {
    print_status "Installing IDVE Dashboard..."
    log "Installing IDVE Dashboard"

    # Check if directory exists
    if [[ -d "$IDVE_DIR" ]]; then
        print_warning "IDVE directory already exists. Backing up..."
        mv "$IDVE_DIR" "$IDVE_DIR.backup.$(date +%Y%m%d_%H%M%S)"
    fi

    # Clone repository (you may need to update this URL)
    if [[ -n "$GIT_REPO" ]]; then
        print_status "Cloning from repository: $GIT_REPO"
        git clone "$GIT_REPO" "$IDVE_DIR" >> "$LOG_FILE" 2>&1
    else
        print_warning "No git repository specified. Please manually place IDVE Dashboard files in $IDVE_DIR"
        mkdir -p "$IDVE_DIR"
        return
    fi

    cd "$IDVE_DIR"

    # Install Node.js dependencies
    print_status "Installing Node.js dependencies..."
    npm install >> "$LOG_FILE" 2>&1

    # Set ownership
    chown -R "$SUDO_USER:$SUDO_USER" "$IDVE_DIR" 2>/dev/null || chown -R root:root "$IDVE_DIR"

    print_success "IDVE Dashboard installed successfully."
}

# Function to configure systemd service
configure_service() {
    print_status "Configuring systemd service..."
    log "Configuring systemd service"

    # Create systemd service file
    cat > /etc/systemd/system/idve-dash.service << EOF
[Unit]
Description=IDVE Dashboard
After=network.target

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=$IDVE_DIR
ExecStart=/usr/bin/node $IDVE_DIR/server.js
Restart=always
RestartSec=10
StandardOutput=file:/var/log/idve-dash.log
StandardError=file:/var/log/idve-dash.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    systemctl daemon-reload >> "$LOG_FILE" 2>&1
    systemctl enable idve-dash >> "$LOG_FILE" 2>&1

    print_success "Systemd service configured."
}

# Function to verify installation
verify_installation() {
    print_status "Verifying installation..."
    log "Verifying installation"

    local errors=0

    # Check KVM
    if ! lsmod | grep -q kvm; then
        print_error "KVM modules not loaded"
        ((errors++))
    fi

    # Check QEMU
    if ! command -v qemu-system-x86_64 &> /dev/null; then
        print_error "QEMU not installed"
        ((errors++))
    fi

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js not installed"
        ((errors++))
    fi

    # Check bridges
    if ! brctl show | grep -q vmbr0; then
        print_warning "vmbr0 bridge not found"
    fi

    # Check directories
    for dir in "$CONFIG_DIR" "$DATA_DIR" "$RUN_DIR"; do
        if [[ ! -d "$dir" ]]; then
            print_error "Directory $dir not found"
            ((errors++))
        fi
    done

    if [[ $errors -eq 0 ]]; then
        print_success "Installation verification passed!"
    else
        print_warning "Installation verification found $errors issues. Check logs for details."
    fi
}

# Function to start service
start_service() {
    print_status "Starting IDVE Dashboard service..."
    log "Starting service"

    systemctl start idve-dash >> "$LOG_FILE" 2>&1

    # Wait a moment and check status
    sleep 3
    if systemctl is-active --quiet idve-dash; then
        print_success "IDVE Dashboard service started successfully."
        print_status "Dashboard should be accessible at: http://$(hostname -I | awk '{print $1}'):3000"
    else
        print_warning "Service failed to start. Check logs: journalctl -u idve-dash -f"
    fi
}

# Function to show post-installation information
show_post_install() {
    echo
    echo "=================================================================="
    echo "🎉 IDVE Dashboard Installation Completed!"
    echo "=================================================================="
    echo
    echo "📊 Service Status:"
    echo "  sudo systemctl status idve-dash"
    echo
    echo "🌐 Web Interface:"
    echo "  http://$(hostname -I | awk '{print $1}'):3000"
    echo
    echo "📝 Log Files:"
    echo "  Application: /var/log/idve-dash.log"
    echo "  Installation: $LOG_FILE"
    echo
    echo "🔧 Management Commands:"
    echo "  Start:   sudo systemctl start idve-dash"
    echo "  Stop:    sudo systemctl stop idve-dash"
    echo "  Restart: sudo systemctl restart idve-dash"
    echo "  Logs:    sudo journalctl -u idve-dash -f"
    echo
    echo "📚 Documentation:"
    echo "  Installation Guide: $IDVE_DIR/INSTALL.md"
    echo "  Debian Guide: $IDVE_DIR/DEBIAN-DEPENDENCIES.md"
    echo
    echo "=================================================================="
}

# Main installation function
main() {
    echo "=================================================================="
    echo "🚀 IDVE Dashboard - Automated Debian Installation"
    echo "=================================================================="
    echo

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --git-repo=*)
                GIT_REPO="${1#*=}"
                shift
                ;;
            --help)
                echo "Usage: $0 [--git-repo=https://github.com/user/repo.git]"
                echo
                echo "Options:"
                echo "  --git-repo    Git repository URL for IDVE Dashboard"
                echo "  --help        Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information."
                exit 1
                ;;
        esac
    done

    # Initialize log file
    touch "$LOG_FILE"
    log "Starting IDVE Dashboard installation"

    # Run installation steps
    check_root
    check_system
    update_system
    install_basic_deps
    install_kvm_qemu
    configure_network
    install_nodejs
    create_directories
    install_idve
    configure_service
    verify_installation
    start_service

    log "Installation completed successfully"
    show_post_install
}

# Run main function
main "$@"