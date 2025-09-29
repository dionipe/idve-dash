const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Helper function to find available port
function findAvailablePort(basePort, callback, maxAttempts = 10) {
  const net = require('net');
  let attempts = 0;
  let currentPort = basePort;
  
  function checkPort(port) {
    const server = net.createServer();
    server.listen(port, '127.0.0.1', () => {
      server.close(() => callback(null, port));
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        attempts++;
        if (attempts >= maxAttempts) {
          callback(new Error(`No available ports found after ${maxAttempts} attempts starting from ${basePort}`), null);
        } else {
          checkPort(port + 1);
        }
      } else {
        callback(err, null);
      }
    });
  }
  
  checkPort(currentPort);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: 'idve-dashboard-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

// Default credentials (in production, use environment variables or database)
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';

// Authentication routes
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === DEFAULT_USERNAME && password === DEFAULT_PASSWORD) {
    req.session.user = { username: username };
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logout successful' });
  });
});

app.get('/api/auth-status', (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to server instances
app.get('/instances', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'instances.html'));
});

// Route to server images
app.get('/images', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'images.html'));
});

// Route to server storages
app.get('/storages', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'storages.html'));
});

// Route to server networks
app.get('/networks', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'networks.html'));
});

// Route to server vm-details
app.get('/vm-detail', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'vm-detail.html'));
});

// API endpoint for host resource monitoring
app.get('/api/host-resources', requireAuth, (req, res) => {
  const resources = {
    cpu: { used: 0, total: 100 },
    memory: { used: 0, total: 0 },
    storage: { used: 0, total: 0 },
    system: {
      cpuCores: 0,
      cpuModel: '',
      cpuSockets: 0,
      kernel: '',
      os: ''
    }
  };

  // Get CPU usage
  exec("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'", (error, stdout, stderr) => {
    if (!error && stdout.trim()) {
      resources.cpu.used = parseFloat(stdout.trim());
    }

    // Get memory info
    exec("free -m | awk 'NR==2{printf \"%.0f %.0f\", $3, $2}'", (error, stdout, stderr) => {
      if (!error && stdout.trim()) {
        const [used, total] = stdout.trim().split(' ').map(Number);
        resources.memory.used = used;
        resources.memory.total = total;
      }

      // Get storage info for root filesystem
      exec("df / | awk 'NR==2{printf \"%.0f %.0f\", $3, $2}'", (error, stdout, stderr) => {
        if (!error && stdout.trim()) {
          const [used, total] = stdout.trim().split(' ').map(Number);
          resources.storage.used = used;
          resources.storage.total = total;
        }

        // Get system info
        exec("nproc", (error, stdout, stderr) => {
          if (!error && stdout.trim()) {
            resources.system.cpuCores = parseInt(stdout.trim());
          }

          exec("grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | sed 's/^ *//'", (error, stdout, stderr) => {
            if (!error && stdout.trim()) {
              resources.system.cpuModel = stdout.trim();
            }

            exec("grep 'physical id' /proc/cpuinfo | sort -u | wc -l", (error, stdout, stderr) => {
              if (!error && stdout.trim()) {
                resources.system.cpuSockets = parseInt(stdout.trim());
              }

              exec("uname -r", (error, stdout, stderr) => {
                if (!error && stdout.trim()) {
                  resources.system.kernel = stdout.trim();
                }

                exec("lsb_release -d | cut -f2", (error, stdout, stderr) => {
                  if (!error && stdout.trim()) {
                    resources.system.os = stdout.trim();
                  } else {
                    // Fallback to /etc/os-release
                    exec("grep PRETTY_NAME /etc/os-release | cut -d'=' -f2 | tr -d '\"'", (error, stdout, stderr) => {
                      if (!error && stdout.trim()) {
                        resources.system.os = stdout.trim();
                      }
                      res.json(resources);
                    });
                  }
                  if (!error) res.json(resources);
                });
              });
            });
          });
        });
      });
    });
  });
});

// API endpoint for network traffic monitoring
let networkTrafficHistory = {};
let lastNetworkStats = {};

app.get('/api/network-traffic', requireAuth, (req, res) => {
  // Get network interface statistics
  exec('cat /proc/net/dev', (error, stdout, stderr) => {
    if (error) {
      console.error('Error getting network stats:', error);
      return res.status(500).json({ error: 'Failed to get network statistics' });
    }

    try {
      const lines = stdout.trim().split('\n').slice(2); // Skip header lines
      const interfaces = {};
      const currentTime = new Date().toISOString();

      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const interfaceName = parts[0].replace(':', '');
        
        // Skip loopback and virtual interfaces
        if (interfaceName === 'lo' || interfaceName.includes(':')) {
          return;
        }

        const rxBytes = parseInt(parts[1]); // Receive bytes
        const txBytes = parseInt(parts[9]); // Transmit bytes

        // Calculate rates if we have previous data
        let rxRate = 0;
        let txRate = 0;
        
        if (lastNetworkStats[interfaceName]) {
          const timeDiff = (new Date(currentTime) - new Date(lastNetworkStats[interfaceName].timestamp)) / 1000;
          if (timeDiff > 0) {
            rxRate = Math.max(0, (rxBytes - lastNetworkStats[interfaceName].rxBytes) / timeDiff);
            txRate = Math.max(0, (txBytes - lastNetworkStats[interfaceName].txBytes) / timeDiff);
          }
        }

        interfaces[interfaceName] = {
          rxBytes: rxBytes,
          txBytes: txBytes,
          rxRate: rxRate,
          txRate: txRate,
          timestamp: currentTime
        };

        // Update last stats
        lastNetworkStats[interfaceName] = {
          rxBytes: rxBytes,
          txBytes: txBytes,
          timestamp: currentTime
        };
      });

      // Update history for each interface (keep 1 hour of data at 5-second intervals = 720 points)
      Object.keys(interfaces).forEach(interfaceName => {
        if (!networkTrafficHistory[interfaceName]) {
          networkTrafficHistory[interfaceName] = [];
        }

        networkTrafficHistory[interfaceName].push({
          timestamp: currentTime,
          rxRate: interfaces[interfaceName].rxRate,
          txRate: interfaces[interfaceName].txRate
        });

        // Keep only last 720 points (1 hour at 5-second intervals)
        if (networkTrafficHistory[interfaceName].length > 720) {
          networkTrafficHistory[interfaceName] = networkTrafficHistory[interfaceName].slice(-720);
        }
      });

      // Calculate totals
      const totals = Object.values(interfaces).reduce(
        (acc, iface) => ({
          rxRate: acc.rxRate + iface.rxRate,
          txRate: acc.txRate + iface.txRate
        }),
        { rxRate: 0, txRate: 0 }
      );

      res.json({
        interfaces: interfaces,
        totals: totals,
        history: networkTrafficHistory
      });
    } catch (e) {
      console.error('Error parsing network data:', e);
      res.status(500).json({ error: 'Failed to parse network data' });
    }
  });
});

// API routes for storages
// Get VNC port for instance console
app.get('/api/instances/:id/vnc', (req, res) => {
  const instanceId = req.params.id;
  const instanceNum = parseInt(instanceId.replace(/\D/g, '')) % 1000; // Keep port numbers reasonable
  const vncPort = 5900 + instanceNum;
  const wsPort = 7900 + instanceNum; // WebSocket port
  
  // Use the actual host from the request instead of hardcoded localhost
  const host = req.headers.host || req.hostname || 'localhost';
  
  res.json({ 
    instanceId: instanceId,
    vncPort: vncPort,
    wsPort: wsPort,
    vncUrl: `vnc.html?host=${host}&port=${wsPort}&path=&autoconnect=true`
  });
});

// API routes for VMs
app.get('/api/instances', requireAuth, (req, res) => {
  const instancesDir = '/etc/idve';
  fs.readdir(instancesDir, (err, files) => {
    if (err) {
      console.error('Error reading instances directory:', err);
      return res.status(500).json({ error: err.message });
    }
    
    const instances = [];
    files.filter(file => file.endsWith('.json')).forEach(file => {
      try {
        const configPath = `${instancesDir}/${file}`;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        instances.push(config);
      } catch (error) {
        console.error(`Error reading instance config ${file}:`, error);
      }
    });
    
    res.json(instances);
  });
});

app.get('/api/instances/:id', requireAuth, (req, res) => {
  const instanceId = req.params.id;
  const configPath = `/etc/idve/${instanceId}.json`;
  
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      res.json(config);
    } else {
      res.status(404).json({ error: 'Instance not found' });
    }
  } catch (error) {
    console.error(`Error reading instance config ${instanceId}:`, error);
    res.status(500).json({ error: 'Failed to read instance configuration' });
  }
});

app.post('/api/instances', requireAuth, (req, res) => {
  let {
    name, instanceId, host, osType, cdrom, cdroms, graphics, machine, bios, scsiController,
    addTpm, qemuAgent, diskBus, diskScsiController, storagePool, diskSize,
    cpuSockets, cpuCores, cpuType, memory, balloonDevice, networkBridge,
    vlanTag, networkModel, macAddress, startAfterCreate
  } = req.body;

  // Handle both single cdrom and cdroms array for backward compatibility
  const allCdroms = cdroms || (cdrom ? [cdrom] : []);

  // Validate and ensure unique MAC address
  if (!macAddress || macAddress.trim() === '') {
    // Auto-generate MAC address if not provided
    const generateRandomMac = () => {
      const mac = ['52', '54', '00'];
      for (let i = 0; i < 3; i++) {
        mac.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
      }
      return mac.join(':');
    };
    macAddress = generateRandomMac();
  }

  // Check if MAC address is already in use by other instances
  const instancesDir = '/etc/idve';
  if (fs.existsSync(instancesDir)) {
    const files = fs.readdirSync(instancesDir).filter(file => file.endsWith('.json'));
    for (const file of files) {
      try {
        const configPath = `${instancesDir}/${file}`;
        const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (existingConfig.macAddress === macAddress && existingConfig.id !== instanceId) {
          return res.status(400).json({ error: `MAC address ${macAddress} is already in use by instance ${existingConfig.id}` });
        }
      } catch (error) {
        console.error(`Error checking MAC address in ${file}:`, error);
      }
    }
  }

  // Build QEMU command with all parameters
  let qemuCmd = `qemu-system-x86_64 -name ${name} -m ${memory} -smp sockets=${cpuSockets},cores=${cpuCores} -cpu ${cpuType}`;

  // Add machine type
  qemuCmd += ` -machine ${machine}`;

  // Add BIOS
  if (bios === 'ovmf') {
    // Use OVMF with Secure Boot for Windows 11 compatibility - use standard path from successful guide
    qemuCmd += ' -drive if=pflash,format=raw,readonly=on,file=/usr/share/ovmf/OVMF_CODE.fd';
    qemuCmd += ' -drive if=pflash,format=raw,file=/usr/share/ovmf/OVMF_VARS.fd';
  }

  // Add disk
  let diskPath, diskFormat;
  let isRBD = false;
  
  if (storagePool && storagePool.startsWith('rbd:')) {
    // RBD storage - extract pool name and create RBD path
    const poolName = storagePool.split(':')[1];
    isRBD = true;
    
    // Find RBD storage configuration
    const rbdStorage = storages.find(s => s.type === 'RBD' && s.pool === poolName);
    if (!rbdStorage) {
      return res.status(400).json({ error: `RBD storage configuration not found for pool ${poolName}` });
    }
    
    // Create RBD path: rbd:pool/image:id=username:key=key:mon_host=monitors
    const monitors = rbdStorage.monitors.replace(/,/g, ':6789,') + ':6789';
    diskPath = `rbd:${poolName}/${name}:id=${rbdStorage.username}:key=${rbdStorage.key}:mon_host=${monitors}`;
    diskFormat = 'raw'; // RBD uses raw format
  } else {
    // Local storage
    diskPath = `${storagePool || '/var/lib/idve/instances'}/${name}.qcow2`;
    diskFormat = 'qcow2';
  }
  
  if (osType === 'windows') {
    // Use VirtIO SCSI Single for Windows VMs (best performance per Proxmox best practices)
    qemuCmd += ` -device virtio-scsi-pci,id=scsi0`;
    qemuCmd += ` -drive file=${diskPath},format=${diskFormat},if=none,id=drive0,cache=writeback,discard=on`;
    qemuCmd += ` -device scsi-hd,drive=drive0,bus=scsi0.0`;
  } else {
    // Use VirtIO for Linux VMs (better compatibility with q35 machine type)
    qemuCmd += ` -drive file=${diskPath},format=${diskFormat},if=virtio,cache=writeback,discard=on`;
  }

  // Add CDROM(s) if specified
  allCdroms.forEach((cdromPath, index) => {
    if (cdromPath) {
      // Use explicit drive with index to avoid conflicts, start from index 1
      qemuCmd += ` -drive file=${cdromPath},if=ide,index=${index + 1},media=cdrom`;
    }
  });

  // Add network
  let netCmd = ` -net nic,model=${networkModel}`;
  if (macAddress) {
    netCmd += `,macaddr=${macAddress}`;
  }
  netCmd += ` -net bridge,br=${networkBridge}`;
  if (vlanTag) {
    netCmd += `,vlan=${vlanTag}`;
  }
  qemuCmd += netCmd;

  // Add graphics
  qemuCmd += ` -vga ${graphics}`;

  // Add SCSI controller if needed (skip for Windows as we use VirtIO SCSI Single)
  if ((diskBus === 'scsi' || scsiController) && osType !== 'windows') {
    qemuCmd += ` -device ${scsiController}`;
  }

  // Add TPM if requested
  let tpmStatePath, tpmSocketPath, tpmPidPath;
  if (addTpm) {
    // Create TPM state directory for swtpm
    tpmStatePath = `/var/lib/idve/instances/${instanceId}-tpm`;
    
    // Create TPM state directory if it doesn't exist
    if (!fs.existsSync(tpmStatePath)) {
      fs.mkdirSync(tpmStatePath, { recursive: true });
      console.log(`TPM state directory created: ${tpmStatePath}`);
    }
    
    // Use TPM emulator instead of passthrough for Windows 11 compatibility
    tpmSocketPath = `/var/run/idve/${instanceId}-tpm.sock`;
    tpmPidPath = `/var/run/idve/${instanceId}-tpm.pid`;
    
    // Ensure run directory exists
    if (!fs.existsSync('/var/run/idve')) {
      fs.mkdirSync('/var/run/idve', { recursive: true });
    }
    
    qemuCmd += ` -chardev socket,id=tpmchar,path=${tpmSocketPath}`;
    qemuCmd += ` -tpmdev emulator,id=tpmdev,chardev=tpmchar`;
    qemuCmd += ` -device tpm-tis,tpmdev=tpmdev`;
  }

  // Add QEMU agent
  if (qemuAgent) {
    qemuCmd += ` -device virtio-serial -chardev socket,path=/var/lib/libvirt/qemu/${name}.agent,server,nowait,id=${name}_agent -device virtserialport,chardev=${name}_agent,name=org.qemu.guest_agent.0`;
  }

  // Add balloon device
  if (balloonDevice) {
    qemuCmd += ' -device virtio-balloon';
  }

  // Boot order - using bootindex on devices for UEFI systems
  // No global boot order needed when using bootindex

      // Save instance configuration as JSON
    const instanceConfig = {
      id: instanceId,
      name,
      host,
      osType,
      cdroms: allCdroms, // Store as array
      graphics,
      machine,
      bios,
      scsiController,
      addTpm,
      qemuAgent,
      diskBus,
      diskScsiController,
      storagePool,
      diskSize,
      cpuSockets: parseInt(cpuSockets),
      cpuCores: parseInt(cpuCores),
      cpuType,
      memory: parseInt(memory),
      balloonDevice: balloonDevice === 'on',
      networkBridge,
      vlanTag,
      networkModel,
      macAddress,
      startAfterCreate: startAfterCreate === 'on',
      createdAt: new Date().toISOString(),
      status: 'created'
    };

    // Add TPM configuration if enabled
    if (addTpm) {
      instanceConfig.tpmStatePath = tpmStatePath;
      instanceConfig.tpmSocketPath = tpmSocketPath;
      instanceConfig.tpmPidPath = tpmPidPath;
    }

    const configPath = `/etc/idve/${instanceId}.json`;
    fs.writeFileSync(configPath, JSON.stringify(instanceConfig, null, 2));
    console.log(`Instance configuration saved to ${configPath}`);

    // If start after create, run the VM
    if (startAfterCreate === 'on') {
      exec(qemuCmd + ' &', (err, out, stde) => {
        if (err) {
          console.error('Error starting VM:', err);
        }
      });
    }

    res.json({ message: 'Instance created successfully', command: qemuCmd, config: instanceConfig });
});

app.put('/api/instances/:id', requireAuth, (req, res) => {
  const instanceId = req.params.id;
  const configPath = `/etc/idve/${instanceId}.json`;
  
  try {
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const updatedConfig = { ...existingConfig, ...req.body, updatedAt: new Date().toISOString() };
    
    // Check if disk size has changed and resize if necessary
    if (req.body.diskSize && parseInt(req.body.diskSize) !== parseInt(existingConfig.diskSize)) {
      const diskPath = existingConfig.diskPath || `/var/lib/idve/instances/${instanceId}.qcow2`;
      
      if (fs.existsSync(diskPath)) {
        const newSize = parseInt(req.body.diskSize);
        console.log(`Resizing disk from ${existingConfig.diskSize}G to ${newSize}G: ${diskPath}`);
        
        exec(`qemu-img resize ${diskPath} ${newSize}G`, (resizeErr, resizeOut, resizeStderr) => {
          if (resizeErr) {
            console.error('Error resizing disk:', resizeErr);
            return res.status(500).json({ error: 'Failed to resize disk' });
          }
          
          console.log(`Disk resized successfully: ${diskPath} -> ${newSize}G`);
          
          // Save updated config after successful resize
          fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
          console.log(`Instance configuration updated: ${configPath}`);
          
          res.json({ 
            message: 'Instance updated successfully with disk resize', 
            config: updatedConfig,
            diskResized: true,
            newSize: `${newSize}G`
          });
        });
        return; // Exit here, response will be sent in callback
      }
    }
    
    // Save config without disk resize
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    console.log(`Instance configuration updated: ${configPath}`);
    
    res.json({ message: 'Instance updated successfully', config: updatedConfig });
  } catch (error) {
    console.error(`Error updating instance ${instanceId}:`, error);
    res.status(500).json({ error: 'Failed to update instance configuration' });
  }
});

app.put('/api/instances/:id/start', requireAuth, (req, res) => {
  const instanceId = req.params.id;
  const configPath = `/etc/idve/${instanceId}.json`;
  
  try {
    // Check if instance config exists
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    // Read instance config first
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Auto-enable TPM for Windows VMs with OVMF if not already enabled
    if (config.osType === 'windows' && config.bios === 'ovmf' && !config.addTpm) {
      console.log(`Auto-enabling TPM for Windows VM ${config.id}`);
      config.addTpm = true;
      // Save updated config
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
    
    // Check if already running
    exec(`ps aux | grep 'qemu-system-x86_64.*-name "${config.name}"' | grep -v grep`, (error, stdout, stderr) => {
      if (stdout.trim() !== '') {
        return res.status(400).json({ error: 'Instance is already running' });
      }
      
      // Build QEMU command
      let cpuModel = config.cpuType || 'host';
      // For Windows 11 compatibility, use Skylake-Client-v3 as per successful guide
      if (config.osType === 'windows') {
        cpuModel = 'Skylake-Client-v3';
      } else if (cpuModel === 'host') {
        // Keep host CPU for better Linux compatibility
        cpuModel = 'host';
      }
      let qemuCmd = `qemu-system-x86_64 -enable-kvm -name "${config.name}" -m ${config.memory} -smp sockets=${config.cpuSockets},cores=${config.cpuCores} -cpu ${cpuModel}`;
      
      // Add machine type
      qemuCmd += ` -machine ${config.machine || 'q35'}`;
      
      // Add BIOS
      if (config.bios === 'ovmf') {
        // Use OVMF with Secure Boot for Windows 11 compatibility - use standard path from successful guide
        qemuCmd += ' -drive if=pflash,format=raw,readonly=on,file=/usr/share/ovmf/OVMF_CODE.fd';
        qemuCmd += ' -drive if=pflash,format=raw,file=/usr/share/ovmf/OVMF_VARS.fd';
      }
      
        // Add disk
        const storagePool = config.storagePool || '/var/lib/idve/instances';
        let diskPath, diskFormat;
        let isRBD = false;
        
        if (storagePool && storagePool.startsWith('rbd:')) {
          // RBD storage - extract pool name and create RBD path
          const poolName = storagePool.split(':')[1];
          isRBD = true;
          
          // Find RBD storage configuration
          const rbdStorage = storages.find(s => s.type === 'RBD' && s.pool === poolName);
          if (!rbdStorage) {
            return res.status(500).json({ error: `RBD storage configuration not found for pool ${poolName}` });
          }
          
          // Create RBD path: rbd:pool/image:id=username:key=key:mon_host=monitors
          const monitors = rbdStorage.monitors.replace(/,/g, ':6789,') + ':6789';
          diskPath = `rbd:${poolName}/${config.id}:id=${rbdStorage.username}:key=${rbdStorage.key}:mon_host=${monitors}`;
          diskFormat = 'raw'; // RBD uses raw format
        } else {
          // Local storage
          diskPath = `${storagePool}/${config.id}.qcow2`;
          diskFormat = 'qcow2';
        }
        
        console.log(`Disk path: ${diskPath}`);
        
        // Create disk if it doesn't exist
        if (isRBD) {
          // Check if RBD image exists
          const rbdStorage = storages.find(s => s.type === 'RBD' && s.pool === storagePool.split(':')[1]);
          const rbdCmd = `rbd --id ${rbdStorage.username} --key ${rbdStorage.key} --mon-host ${rbdStorage.monitors.replace(/,/g, ':6789,')}:6789 info ${storagePool.split(':')[1]}/${config.id}`;
          
          exec(rbdCmd, (rbdErr, rbdOut, rbdStderr) => {
            if (rbdErr) {
              // RBD image doesn't exist, create it
              console.log(`Creating RBD image: ${storagePool.split(':')[1]}/${config.id} (${config.diskSize}G)`);
              const createCmd = `rbd --id ${rbdStorage.username} --key ${rbdStorage.key} --mon-host ${rbdStorage.monitors.replace(/,/g, ':6789,')}:6789 create --size ${config.diskSize}G ${storagePool.split(':')[1]}/${config.id}`;
              exec(createCmd, (createErr, createOut, createStderr) => {
                if (createErr) {
                  console.error('Error creating RBD image:', createErr);
                  return res.status(500).json({ error: 'Failed to create RBD image' });
                }
                startQemu();
              });
            } else {
              // RBD image exists
              startQemu();
            }
          });
        } else {
          // Local storage - create qcow2 file if it doesn't exist
          if (!fs.existsSync(diskPath)) {
            console.log(`Creating disk file: ${diskPath} (${config.diskSize}G)`);
            exec(`qemu-img create -f qcow2 ${diskPath} ${config.diskSize}G`, (diskErr, diskOut, diskStderr) => {
              if (diskErr) {
                console.error('Error creating disk:', diskErr);
                return res.status(500).json({ error: 'Failed to create instance disk' });
              }
              startQemu();
            });
          } else {
            startQemu();
          }
        }
        
        function startQemu() {
          // Simplified QEMU command that works
          if (config.osType === 'windows') {
            // Use VirtIO SCSI Single for Windows VMs (best performance per Proxmox best practices)
            qemuCmd += ` -device virtio-scsi-pci,id=scsi0`;
            qemuCmd += ` -drive file=${diskPath},format=${diskFormat},if=none,id=drive0,cache=writeback,discard=on`;
            qemuCmd += ` -device scsi-hd,drive=drive0,bus=scsi0.0`;
          } else {
            // Use VirtIO for Linux VMs (better compatibility with q35 machine type)
            qemuCmd += ` -drive file=${diskPath},format=${diskFormat},if=virtio,cache=writeback,discard=on`;
          }
          
          // Add Cloud-Init drive if this is a Cloud-Init instance
          if (config.cloudInit && config.cloudInitIsoPath) {
            qemuCmd += ` -drive file=${config.cloudInitIsoPath},if=virtio,format=raw`;
          }
          
          // Add CDROM(s) if specified
          const cdroms = config.cdroms || (config.cdrom ? [config.cdrom] : []);
          cdroms.forEach((cdrom, index) => {
            if (cdrom) {
              // Use explicit drive with index to avoid conflicts, start from index 1
              qemuCmd += ` -drive file=${cdrom},if=ide,index=${index + 1},media=cdrom`;
            }
          });
          
          // Add network using bridge from config
          if (config.networkBridge) {
            const networkModel = config.osType === 'windows' ? 'virtio' : (config.networkModel || 'virtio');
            qemuCmd += ` -net nic,model=${networkModel}`;
            if (config.macAddress) {
              qemuCmd += `,macaddr=${config.macAddress}`;
            }
            qemuCmd += ` -net bridge,br=${config.networkBridge}`;
            if (config.vlanTag) {
              qemuCmd += `,vlan=${config.vlanTag}`;
            }
          } else {
            // Fallback to user networking if no bridge configured
            qemuCmd += ` -net nic,model=virtio -net user`;
          }
          
          // Graphics and display - enable VNC for console access
          const vncInstanceNum = parseInt(config.id.replace(/\D/g, '')) % 1000; // Keep port numbers reasonable
          const vncPort = 5900 + vncInstanceNum;
          const vncDisplay = vncPort - 5900; // Convert port to VNC display number
          qemuCmd += ` -vnc :${vncDisplay} -k en-us`;
          
          // Add QEMU agent
          if (config.qemuAgent) {
            // Ensure agent socket directory exists
            const agentSocketDir = `/var/lib/libvirt/qemu/domain-${config.id}`;
            exec(`mkdir -p ${agentSocketDir}`, () => {
              qemuCmd += ` -device virtio-serial-pci -chardev socket,path=${agentSocketDir}/agent.sock,server=on,wait=off,id=agent_${config.id} -device virtserialport,chardev=agent_${config.id},name=org.qemu.guest_agent.0`;
            });
          }
          
          // Add balloon device
          if (config.balloonDevice) {
            qemuCmd += ' -device virtio-balloon';
          }
          
          // Add TPM if configured
          if (config.addTpm && config.tpmStatePath) {
            // Clean up any existing swtpm processes and files more aggressively
            exec(`pkill -9 -f swtpm || true`, () => {
              exec(`rm -rf /tmp/emulated_tpm || true`, () => {
                // Create TPM directory
                exec(`mkdir -p /tmp/emulated_tpm`, () => {
                  // Remove socket and pid files if they exist
                  try {
                    if (fs.existsSync('/tmp/emulated_tpm/swtpm-sock')) fs.unlinkSync('/tmp/emulated_tpm/swtpm-sock');
                    if (fs.existsSync('/tmp/emulated_tpm/swtpm.pid')) fs.unlinkSync('/tmp/emulated_tpm/swtpm.pid');
                  } catch (e) {
                    // Ignore cleanup errors
                  }
                  
                  // Wait a moment for cleanup
                  setTimeout(() => {
                    // Start swtpm emulator with standard path from successful guide
                    const swtpmCmd = `swtpm socket --tpmstate dir=/tmp/emulated_tpm --ctrl type=unixio,path=/tmp/emulated_tpm/swtpm-sock --tpm2 --daemon --pid file=/tmp/emulated_tpm/swtpm.pid`;
                    console.log(`Starting swtpm: ${swtpmCmd}`);
                    
                    exec(swtpmCmd, (swtpmErr, swtpmOut, swtpmStderr) => {
                      if (swtpmErr) {
                        console.error('Error starting swtpm:', swtpmErr);
                        console.log('Continuing without TPM - Windows may not boot properly');
                        // Continue without TPM
                        startQemu(false);
                      } else {
                        console.log('swTPM started successfully');
                        // Wait a moment for swTPM to be ready
                        setTimeout(() => {
                          startQemu(true);
                        }, 1000);
                      }
                    });
                  }, 500);
                });
              });
            });
          } else {
            startQemu(false);
          }
          
          function startQemu(withTpm) {
            // Add TPM device to QEMU command if TPM is enabled and ready
            if (withTpm) {
              qemuCmd += ` -chardev socket,id=chrtpm,path=/tmp/emulated_tpm/swtpm-sock`;
              qemuCmd += ` -tpmdev emulator,id=tpm0,chardev=chrtpm`;
              qemuCmd += ` -device tpm-tis,tpmdev=tpm0`;
            }
            
            // Add sound card for better malware analysis compatibility
            if (config.osType === 'windows') {
              qemuCmd += ` -device intel-hda -device hda-duplex`;
            }
            
            // Add USB support
            qemuCmd += ` -usb`;
            
            // Boot order - using bootindex on devices for UEFI systems
            // No global boot order needed when using bootindex
            
            // Daemonize for background execution
            qemuCmd += ' -daemonize';
            
            console.log(`QEMU command: ${qemuCmd}`);
          
          // Write QEMU command to a script and execute it
          const scriptPath = `/tmp/qemu-start-${config.id}.sh`;
          const scriptContent = `#!/bin/bash\n${qemuCmd}\n`;
          fs.writeFileSync(scriptPath, scriptContent);
          fs.chmodSync(scriptPath, '755');
          
          exec(scriptPath, (qemuErr, qemuOut, qemuStderr) => {
            if (qemuErr) {
              console.error('Error starting QEMU:', qemuErr);
              // Don't send error response here
            }
            
            // Clean up the script
            try {
              fs.unlinkSync(scriptPath);
            } catch (e) {
              // Ignore cleanup errors
            }
            
            // Check if QEMU actually started by looking for the process after a short delay
            setTimeout(() => {
              exec(`ps aux | grep 'qemu-system-x86_64.*-name "${config.name}"' | grep -v grep`, (checkError, checkStdout, checkStderr) => {
                if (checkStdout.trim() !== '') {
                  console.log('QEMU started successfully and is running');
                } else {
                  console.log('QEMU process not found after start attempt');
                }
              });
            }, 2000);
          });
          
          // Start websockify for VNC proxy (use different port for WebSocket)
          const instanceNum = parseInt(config.id.replace(/\D/g, '')) % 1000; // Keep port numbers reasonable
          const qemuVncPort = 5900 + instanceNum; // Exact VNC port QEMU will use
          const baseWsPort = 7900 + instanceNum; // WebSocket port
          
          // Clean up any existing websockify processes for this instance
          exec(`pkill -f "websockify.*localhost:${qemuVncPort}" || true`, () => {
            // Find available WebSocket port for websockify
            findAvailablePort(baseWsPort, (wsPortErr, wsPort) => {
              if (wsPortErr) {
                console.error('Failed to find available WebSocket port:', wsPortErr);
                return;
              }
              
              // Connect websockify directly to the VNC port QEMU is using
              exec(`websockify --daemon ${wsPort} localhost:${qemuVncPort}`, (wsError, wsOut, wsStderr) => {
                if (wsError) {
                  console.error('Warning: Failed to start websockify:', wsError);
                  // Don't fail the VM start if websockify fails
                } else {
                  console.log(`Started websockify on port ${wsPort} proxying to VNC port ${qemuVncPort}`);
                }
              });
            });
          });
          
          // Update instance status
          config.status = 'running';
          config.startedAt = new Date().toISOString();
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
          
          res.json({ message: 'Instance started successfully' });
        }
      }
    });
  } catch (error) {
    console.error('Error starting instance:', error);
    res.status(500).json({ error: 'Failed to start instance' });
  }
});

app.put('/api/instances/:id/stop', requireAuth, (req, res) => {
  const instanceId = req.params.id;
  const configPath = `/etc/idve/${instanceId}.json`;
  
  try {
    // Read instance config to get the instance name
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const instanceName = config.name;
    
    // Find and kill QEMU process using the same logic as status checking
    exec(`pkill -9 -f "qemu-system-x86_64.*-name ${instanceName}"`, (error, stdout, stderr) => {
      // Note: pkill returns error if no processes found, but that's OK for us
      // as it means the instance is already stopped
      
      // Wait a moment for the process to actually terminate
      setTimeout(() => {
        // Also kill websockify process for this instance
        const instanceNum = parseInt(instanceId.replace(/\D/g, '')) % 1000; // Keep port numbers reasonable
        const wsPort = 7900 + instanceNum;
        // Kill websockify processes in a range around the expected port
        exec(`pkill -f "websockify.*${wsPort}" || pkill -f "websockify.*$((wsPort-5))" || pkill -f "websockify.*$((wsPort+5))"`, (wsError, wsOut, wsStderr) => {
          // Note: pkill returns error if no processes found, that's OK
          console.log(`Stopped websockify processes around port ${wsPort}`);
        });
        
        // Stop swtpm if TPM was configured
        if (config.addTpm && config.tpmPidPath && fs.existsSync(config.tpmPidPath)) {
          try {
            const tpmPid = fs.readFileSync(config.tpmPidPath, 'utf8').trim();
            exec(`kill ${tpmPid}`, (killErr) => {
              if (killErr) {
                console.error('Error stopping swtpm:', killErr);
              } else {
                console.log('swTPM stopped successfully');
                // Clean up PID file
                fs.unlinkSync(config.tpmPidPath);
              }
            });
          } catch (pidErr) {
            console.error('Error reading TPM PID file:', pidErr);
          }
        }
        
        // Update instance status
        config.status = 'stopped';
        config.stoppedAt = new Date().toISOString();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        res.json({ message: 'Instance stopped successfully' });
      }, 3000); // Wait 3 seconds for QEMU to terminate
    });
  } catch (error) {
    console.error('Error stopping instance:', error);
    res.status(500).json({ error: 'Failed to stop instance' });
  }
});

app.delete('/api/instances/:id', requireAuth, (req, res) => {
  const instanceId = req.params.id;
  const diskPath = `/var/lib/idve/instances/${instanceId}.qcow2`;
  const configPath = `/etc/idve/${instanceId}.json`;
  
  // First, read the config to check if it's a CloudInit instance
  fs.readFile(configPath, 'utf8', (configErr, configData) => {
    let isCloudInit = false;
    let cloudInitFiles = [];
    
    if (!configErr) {
      try {
        const config = JSON.parse(configData);
        isCloudInit = config.cloudInit || false;
        
        // Collect CloudInit file paths if they exist
        if (config.userDataPath) cloudInitFiles.push(config.userDataPath);
        if (config.metaDataPath) cloudInitFiles.push(config.metaDataPath);
        if (config.cloudInitIsoPath) cloudInitFiles.push(config.cloudInitIsoPath);
        
        // Also add network-data file if it exists
        const networkDataPath = `/var/lib/idve/cloudinit/${instanceId}-network-data`;
        cloudInitFiles.push(networkDataPath);
      } catch (parseErr) {
        console.error('Error parsing config for cleanup:', parseErr);
      }
    }
    
    // Remove disk file
    fs.unlink(diskPath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error('Error deleting disk:', err);
        return res.status(500).json({ error: 'Failed to delete instance disk' });
      }
      
      // Remove config file
      fs.unlink(configPath, (err) => {
        if (err && err.code !== 'ENOENT') {
          console.error('Error deleting config:', err);
          return res.status(500).json({ error: 'Failed to delete instance config' });
        }
        
        // Clean up CloudInit files if this was a CloudInit instance
        if (isCloudInit && cloudInitFiles.length > 0) {
          let cleanupErrors = [];
          
          cloudInitFiles.forEach(filePath => {
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Cleaned up CloudInit file: ${filePath}`);
              }
            } catch (cleanupErr) {
              console.error(`Error cleaning up CloudInit file ${filePath}:`, cleanupErr);
              cleanupErrors.push(`Failed to delete ${filePath}`);
            }
          });
          
          if (cleanupErrors.length > 0) {
            console.warn('Some CloudInit files could not be cleaned up:', cleanupErrors);
          }
        }
        
        res.json({ message: 'Instance deleted successfully' });
      });
    });
  });
});

// Helper function to get IP address from running instance using qemu-guest-agent
function getInstanceIPAddress(instanceId, config, callback) {
  const instanceName = config.name;
  const macAddress = config.macAddress;

  // If instance is running and has qemu-guest-agent, try to get IP address via guest agent first
  if (config.qemuAgent) {
    // Look for the QEMU process and extract the guest agent socket path
    exec(`ps aux | grep 'qemu-system-x86_64.*-name "${instanceName}"' | grep -v grep`, (error, stdout, stderr) => {
      if (error || !stdout.trim()) {
        return tryDHCPMethods(instanceId, config, callback);
      }

      // Try to use virsh/qemu-agent if available, otherwise try direct socket communication to guest agent

      // The guest agent socket is typically at /var/lib/libvirt/qemu/domain-{instanceId}/agent.sock
      const agentSocket = `/var/lib/libvirt/qemu/domain-${instanceId}/agent.sock`;

      // Check if agent socket exists
      if (fs.existsSync(agentSocket)) {
        // Use socat to communicate with the guest agent
        const socatCmd = `echo '{"execute": "guest-network-get-interfaces"}' | socat - UNIX-CONNECT:${agentSocket}`;

        exec(socatCmd, (agentError, agentStdout, agentStderr) => {
          if (agentError) {
            console.log('Guest agent communication failed, trying DHCP methods');
            tryDHCPMethods(instanceId, config, callback);
          } else {
            try {
              const response = JSON.parse(agentStdout);
              if (response.return && response.return.length > 0) {
                // Find the first interface with IP addresses
                for (const iface of response.return) {
                  if (iface['ip-addresses'] && iface['ip-addresses'].length > 0) {
                    // Find IPv4 address
                    const ipv4Addr = iface['ip-addresses'].find(addr => addr['ip-address-type'] === 'ipv4');
                    if (ipv4Addr && ipv4Addr['ip-address']) {
                      return callback(null, ipv4Addr['ip-address']);
                    }
                  }
                }
              }
              // No IP found via guest agent, try DHCP methods
              tryDHCPMethods(instanceId, config, callback);
            } catch (parseError) {
              console.error('Error parsing guest agent response:', parseError);
              tryDHCPMethods(instanceId, config, callback);
            }
          }
        });
      } else {
        // No agent socket found, try DHCP methods
        tryDHCPMethods(instanceId, config, callback);
      }
    });
  } else {
    // No guest agent, directly try DHCP methods
    tryDHCPMethods(instanceId, config, callback);
  }
}

// Try to get IP address using DHCP-related methods (ARP table, DHCP leases, etc.)
function tryDHCPMethods(instanceId, config, callback) {
  const macAddress = config.macAddress;

  if (!macAddress) {
    return callback(null, null);
  }

  console.log(`Trying DHCP methods for instance ${instanceId} with MAC ${macAddress}`);

  // Method 1: Check ARP table for the MAC address
  exec(`ip neigh show | grep "${macAddress}" | awk '{print $1}' | head -1`, (arpError, arpStdout, arpStderr) => {
    if (!arpError && arpStdout.trim() && arpStdout.trim() !== '') {
      const ipFromArp = arpStdout.trim();
      console.log(`Found IP ${ipFromArp} in ARP table for MAC ${macAddress}`);
      return callback(null, ipFromArp);
    }

    // Method 2: Check DHCP leases file if it exists
    exec(`grep -i "${macAddress}" /var/lib/dhcp/dhcpd.leases 2>/dev/null | grep -oP 'lease \\K[0-9.]+' | tail -1`, (dhcpError, dhcpStdout, dhcpStderr) => {
      if (!dhcpError && dhcpStdout.trim() && dhcpStdout.trim() !== '') {
        const ipFromDhcp = dhcpStdout.trim();
        console.log(`Found IP ${ipFromDhcp} in DHCP leases for MAC ${macAddress}`);
        return callback(null, ipFromDhcp);
      }

      // Method 3: Check if instance is connected to a bridge and look for IP in bridge fdb
      // This is more complex and might not be reliable, so we'll skip for now

      console.log(`No IP address found for instance ${instanceId} with MAC ${macAddress}`);
      callback(null, null);
    });
  });
}

app.get('/api/instances/:id/status', (req, res) => {
  const instanceId = req.params.id;
  const configPath = `/etc/idve/${instanceId}.json`;
  
  try {
    // Read instance config to get the instance name
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const instanceName = config.name;
    
    // Check if QEMU process is running for this instance
    // Use the same logic as in start endpoint: check for qemu-system-x86_64 with instance name
    exec(`ps aux | grep 'qemu-system-x86_64.*-name ${instanceName}' | grep -v grep`, (error, stdout, stderr) => {
      const isRunning = stdout.trim() !== '';
      
      // If instance is running and has qemu-guest-agent, try to get IP address
      if (isRunning && config.qemuAgent) {
        getInstanceIPAddress(instanceId, config, (ipError, ipAddress) => {
          res.json({ 
            instanceId: instanceId,
            isRunning: isRunning,
            status: isRunning ? 'running' : 'stopped',
            ipAddress: ipAddress || null
          });
        });
      } else {
        res.json({ 
          instanceId: instanceId,
          isRunning: isRunning,
          status: isRunning ? 'running' : 'stopped',
          ipAddress: null
        });
      }
    });
  } catch (error) {
    console.error('Error checking instance status:', error);
    res.status(500).json({ error: 'Failed to check instance status' });
  }
});

// Get VNC port for instance console
app.get('/api/instances/:id/vnc', (req, res) => {
  const instanceId = req.params.id;
  const instanceNum = parseInt(instanceId.replace(/\D/g, '')) % 1000; // Keep port numbers reasonable
  const vncPort = 5900 + instanceNum;
  res.json({ 
    instanceId: instanceId,
    vncPort: vncPort,
    vncUrl: `vnc.html?host=localhost&port=${vncPort}`
  });
});

// API routes for images
app.get('/api/images', requireAuth, (req, res) => {
  const imagesDir = '/var/lib/idve/images';
  fs.readdir(imagesDir, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(files);
  });
});

// API routes for CloudInit templates
app.get('/api/cloudinit-templates', requireAuth, (req, res) => {
  const templatesDir = '/var/lib/idve/cloudinit-templates';
  
  // Ensure directory exists
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
  
  fs.readdir(templatesDir, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const templates = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        try {
          const templatePath = `${templatesDir}/${file}`;
          const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
          return {
            id: file.replace('.json', ''),
            name: templateData.name || file.replace('.json', ''),
            description: templateData.description || '',
            os: templateData.os || '',
            version: templateData.version || '',
            image: templateData.image || '',
            createdAt: templateData.createdAt || null
          };
        } catch (parseErr) {
          console.error(`Error parsing template ${file}:`, parseErr);
          return null;
        }
      })
      .filter(template => template !== null);
    
    res.json(templates);
  });
});

// Upload CloudInit template
app.post('/api/cloudinit-templates', requireAuth, (req, res) => {
  const { name, description, os, version, image, userDataTemplate } = req.body;
  
  if (!name || !os || !image) {
    return res.status(400).json({ error: 'Name, OS, and image are required' });
  }
  
  const templatesDir = '/var/lib/idve/cloudinit-templates';
  
  // Ensure directory exists
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }
  
  const templateId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const templatePath = `${templatesDir}/${templateId}.json`;
  
  const templateData = {
    name,
    description: description || '',
    os,
    version: version || '',
    image,
    userDataTemplate: userDataTemplate || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  try {
    fs.writeFileSync(templatePath, JSON.stringify(templateData, null, 2));
    res.json({ 
      success: true, 
      message: 'CloudInit template created successfully',
      template: {
        id: templateId,
        ...templateData
      }
    });
  } catch (error) {
    console.error('Error saving template:', error);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// Delete CloudInit template
app.delete('/api/cloudinit-templates/:id', requireAuth, (req, res) => {
  const templateId = req.params.id;
  const templatesDir = '/var/lib/idve/cloudinit-templates';
  const templatePath = `${templatesDir}/${templateId}.json`;
  
  if (!fs.existsSync(templatePath)) {
    return res.status(404).json({ error: 'Template not found' });
  }
  
  try {
    fs.unlinkSync(templatePath);
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Get CloudInit template details
app.get('/api/cloudinit-templates/:id', requireAuth, (req, res) => {
  const templateId = req.params.id;
  const templatesDir = '/var/lib/idve/cloudinit-templates';
  const templatePath = `${templatesDir}/${templateId}.json`;
  
  if (!fs.existsSync(templatePath)) {
    return res.status(404).json({ error: 'Template not found' });
  }
  
  try {
    const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    res.json(templateData);
  } catch (error) {
    console.error('Error reading template:', error);
    res.status(500).json({ error: 'Failed to read template' });
  }
});

// Update CloudInit template
app.put('/api/cloudinit-templates/:id', requireAuth, (req, res) => {
  const templateId = req.params.id;
  const templatesDir = '/var/lib/idve/cloudinit-templates';
  const templatePath = `${templatesDir}/${templateId}.json`;
  
  if (!fs.existsSync(templatePath)) {
    return res.status(404).json({ error: 'Template not found' });
  }
  
  try {
    const existingTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const updatedTemplate = {
      ...existingTemplate,
      ...req.body,
      id: templateId,
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(templatePath, JSON.stringify(updatedTemplate, null, 2));
    res.json({ success: true, template: updatedTemplate });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Upload ISO file
const multer = require('multer');
const upload = multer({ dest: '/tmp/' });

app.post('/api/upload-iso', requireAuth, upload.single('iso'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const isosDir = '/var/lib/idve/isos';
  if (!fs.existsSync(isosDir)) {
    fs.mkdirSync(isosDir, { recursive: true });
  }
  
  const originalName = req.file.originalname;
  const targetPath = `${isosDir}/${originalName}`;
  
  // Move file from temp to isos directory
  fs.rename(req.file.path, targetPath, (err) => {
    if (err) {
      console.error('Error moving uploaded file:', err);
      return res.status(500).json({ error: 'Failed to save uploaded file' });
    }
    
    res.json({ 
      success: true, 
      message: 'ISO uploaded successfully',
      filename: originalName,
      path: targetPath
    });
  });
});

// Upload base image file
app.post('/api/upload-base-image', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const imagesDir = '/var/lib/idve/images';
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  const originalName = req.file.originalname;
  const targetPath = `${imagesDir}/${originalName}`;
  
  // Move file from temp to images directory
  fs.rename(req.file.path, targetPath, (err) => {
    if (err) {
      console.error('Error moving uploaded image file:', err);
      return res.status(500).json({ error: 'Failed to save uploaded image file' });
    }
    
    res.json({ 
      success: true, 
      message: 'Base image uploaded successfully',
      filename: originalName,
      path: targetPath
    });
  });
});

app.get('/api/isos', requireAuth, (req, res) => {
  const isosDir = '/var/lib/idve/isos';
  fs.readdir(isosDir, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(files);
  });
});

// Delete ISO file
app.delete('/api/isos/:filename', requireAuth, (req, res) => {
  const filename = req.params.filename;
  const isosDir = '/var/lib/idve/isos';
  const filePath = `${isosDir}/${filename}`;
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'ISO file not found' });
  }
  
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Error deleting ISO file:', err);
      return res.status(500).json({ error: 'Failed to delete ISO file' });
    }
    
    res.json({ success: true, message: 'ISO deleted successfully' });
  });
});

// API routes for networks
app.get('/api/networks', requireAuth, (req, res) => {
  const { exec } = require('child_process');
  
  // Get network interfaces with addresses
  exec('ip -j addr show', (error, stdout, stderr) => {
    if (error) {
      console.error('Error getting network interfaces:', error);
      return res.status(500).json({ error: 'Failed to get network interfaces' });
    }
    
    try {
      const interfaces = JSON.parse(stdout);
      let systemNetworks = interfaces.map(iface => {
        const addr = iface.addr_info.find(a => a.family === 'inet');
        return {
          name: iface.ifname,
          type: iface.link_type || (iface.ifname.startsWith('br') ? 'bridge' : iface.ifname.startsWith('bond') ? 'bond' : iface.ifname.startsWith('vlan') ? 'vlan' : 'interface'),
          active: iface.flags.includes('UP'),
          autostart: true, // Assume for now
          vlanaware: iface.ifname.includes('vlan'),
          ports: iface.master || '',
          cidr: addr ? `${addr.local}/${addr.prefixlen}` : '',
          gateway: '' // Would need route command
        };
      });
      
      // Get bridges
      exec('brctl show 2>/dev/null || echo "No brctl"', (err, brStdout) => {
        if (!err && brStdout.trim() !== 'No brctl') {
          const bridgeLines = brStdout.trim().split('\n').slice(1);
          bridgeLines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4 && parts[0] !== 'bridge') {
              const existing = systemNetworks.find(n => n.name === parts[0]);
              if (existing) {
                existing.ports = parts.slice(3).join(', ');
                existing.type = 'bridge'; // Update type to bridge for existing bridge interfaces
              } else {
                systemNetworks.push({
                  name: parts[0],
                  type: 'bridge',
                  active: true,
                  autostart: true,
                  vlanaware: false,
                  ports: parts.slice(3).join(', '),
                  cidr: '',
                  gateway: ''
                });
              }
            }
          });
        }
        
        // Get bonds
        exec('ls /proc/net/bonding/ 2>/dev/null || echo "No bonds"', (err, bondStdout) => {
          if (!err && bondStdout.trim() !== 'No bonds') {
            const bonds = bondStdout.trim().split('\n');
            bonds.forEach(bond => {
              if (bond) {
                const existing = systemNetworks.find(n => n.name === bond);
                if (existing) {
                  existing.type = 'bond';
                } else {
                  systemNetworks.push({
                    name: bond,
                    type: 'bond',
                    active: true,
                    autostart: true,
                    vlanaware: false,
                    ports: '',
                    cidr: '',
                    gateway: ''
                  });
                }
              }
            });
          }
          
          // Merge system networks with user-created networks
          // User-created networks take priority over system networks for the same interface
          const networkMap = new Map();
          
          // Add system networks first
          systemNetworks.forEach(net => {
            networkMap.set(net.name, net);
          });
          
          // Override with user-created networks
          networks.forEach(net => {
            networkMap.set(net.name, net);
          });
          
          const allNetworks = Array.from(networkMap.values());
          res.json(allNetworks);
        });
      });
    } catch (e) {
      console.error('Parse error:', e);
      res.status(500).json({ error: 'Failed to parse network data' });
    }
  });
});

app.post('/api/networks', requireAuth, (req, res) => {
  const { name, type, cidr, gateway, bridgePorts } = req.body;
  
  // Validate that bridge ports are not already in use
  if (bridgePorts && bridgePorts.length > 0) {
    const { exec } = require('child_process');
    
    // Check if any of the requested ports are already in bridges
    exec('brctl show', (error, stdout, stderr) => {
      if (!error) {
        const lines = stdout.trim().split('\n');
        const usedPorts = [];
        
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4 && parts[0] !== 'bridge') {
            // Add all interfaces from this bridge
            usedPorts.push(...parts.slice(3));
          }
        });
        
        const conflictingPorts = bridgePorts.filter(port => usedPorts.includes(port));
        if (conflictingPorts.length > 0) {
          return res.status(400).json({ 
            error: `Bridge ports already in use: ${conflictingPorts.join(', ')}. Please choose different interfaces or remove them from existing bridges first.` 
          });
        }
      }
      
      // Continue with network creation
      createNetwork();
    });
  } else {
    createNetwork();
  }
  
  function createNetwork() {
  
  // Generate network configuration based on type
  let configBlock = '';
  let commands = [];
  
  switch (type) {
    case 'bridge':
      configBlock = `\nauto ${name}\niface ${name} inet ${cidr ? 'static' : 'manual'}`;
      if (cidr) {
        let [address, netmask] = cidr.split('/');
        // If address ends with .0 (network address), use .1 for the interface
        if (address.endsWith('.0')) {
          const parts = address.split('.');
          parts[3] = '1';
          address = parts.join('.');
        }
        configBlock += `\n        address ${address}/${netmask}`;
        // Only add gateway if it's different from the interface address
        if (gateway && gateway !== address) {
          configBlock += `\n        gateway ${gateway}`;
        }
      }
      if (bridgePorts && bridgePorts.length > 0) {
        configBlock += `\n        bridge-ports ${bridgePorts.join(' ')}`;
      }
      configBlock += `\n        bridge-stp off\n        bridge-fd 0`;
      
      // Commands to create the bridge
      commands = [
        `brctl addbr ${name}`,
        ...(bridgePorts && bridgePorts.length > 0 ? bridgePorts.map(port => `brctl addif ${name} ${port}`) : [])
      ];
      break;
      
    case 'interface':
      configBlock = `\nauto ${name}\niface ${name} inet ${cidr ? 'static' : 'dhcp'}`;
      if (cidr) {
        const [address, netmask] = cidr.split('/');
        configBlock += `\n        address ${address}/${netmask}`;
        if (gateway) {
          configBlock += `\n        gateway ${gateway}`;
        }
      }
      break;
      
    case 'vlan':
      const [parentInterface, vlanId] = name.split('.');
      configBlock = `\nauto ${name}\niface ${name} inet ${cidr ? 'static' : 'manual'}\n        vlan-raw-device ${parentInterface}`;
      if (cidr) {
        const [address, netmask] = cidr.split('/');
        configBlock += `\n        address ${address}/${netmask}`;
        if (gateway) {
          configBlock += `\n        gateway ${gateway}`;
        }
      }
      break;
      
    case 'bond':
      configBlock = `\nauto ${name}\niface ${name} inet ${cidr ? 'static' : 'manual'}\n        bond-mode balance-rr\n        bond-miimon 100\n        bond-downdelay 200\n        bond-updelay 200`;
      if (bridgePorts && bridgePorts.length > 0) {
        configBlock += `\n        bond-slaves ${bridgePorts.join(' ')}`;
      }
      if (cidr) {
        const [address, netmask] = cidr.split('/');
        configBlock += `\n        address ${address}/${netmask}`;
        if (gateway) {
          configBlock += `\n        gateway ${gateway}`;
        }
      }
      break;
  }
  
  // Add configuration to /etc/network/interfaces
  const fs = require('fs');
  try {
    fs.appendFileSync('/etc/network/interfaces', configBlock + '\n');
    console.log(`Added network configuration for ${name} to /etc/network/interfaces`);
  } catch (error) {
    console.error('Error writing to /etc/network/interfaces:', error);
    return res.status(500).json({ error: 'Failed to update network configuration' });
  }
  
  // Execute commands to create the network immediately
  if (commands.length > 0) {
    const { exec } = require('child_process');
    commands.forEach(cmd => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing ${cmd}:`, error);
        } else {
          console.log(`Executed: ${cmd}`);
        }
      });
    });
  }
  
  // Add bridge to QEMU bridge.conf if it's a bridge
  if (type === 'bridge') {
    try {
      const fs = require('fs');
      const bridgeConfPath = '/etc/qemu/bridge.conf';
      
      // Read current bridge.conf content
      let bridgeConfContent = '';
      if (fs.existsSync(bridgeConfPath)) {
        bridgeConfContent = fs.readFileSync(bridgeConfPath, 'utf8');
      }
      
      // Check if bridge is already allowed
      const allowedBridges = bridgeConfContent.split('\n').map(line => line.trim());
      const allowLine = `allow ${name}`;
      
      if (!allowedBridges.includes(allowLine)) {
        // Add the bridge to allowed list
        bridgeConfContent += (bridgeConfContent ? '\n' : '') + allowLine;
        fs.writeFileSync(bridgeConfPath, bridgeConfContent);
        console.log(`Added bridge ${name} to /etc/qemu/bridge.conf`);
      } else {
        console.log(`Bridge ${name} already allowed in /etc/qemu/bridge.conf`);
      }
    } catch (error) {
      console.error('Error updating /etc/qemu/bridge.conf:', error);
      // Don't fail the entire operation if this fails
    }
  }
  
  // Bring up the interface using ifup instead of restarting networking
  const { exec } = require('child_process');
  exec(`ifup ${name}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error bringing up ${name}:`, error);
      // If ifup fails, try restarting networking as fallback
      exec('systemctl restart networking', (netError, netStdout, netStderr) => {
        if (netError) {
          console.error('Networking restart also failed:', netError);
        } else {
          console.log('Networking service restarted as fallback');
        }
      });
    } else {
      console.log(`Successfully brought up ${name} with ifup`);
    }
  });
  
  const newNetwork = {
    name,
    type,
    active: true,
    autostart: true,
    vlanaware: type === 'vlan',
    ports: bridgePorts ? bridgePorts.join(', ') : '',
    cidr,
    gateway
  };
  networks.push(newNetwork);
  res.json({ message: 'Network created and configured' });
  }
});

app.put('/api/networks/:name', requireAuth, (req, res) => {
  const name = req.params.name;
  const { type, cidr, gateway, bridgePorts } = req.body;
  
  // Find the network in our in-memory array
  const networkIndex = networks.findIndex(net => net.name === name);
  if (networkIndex === -1) {
    return res.status(404).json({ error: 'Network not found' });
  }
  
  // Update the network configuration
  const updatedNetwork = {
    name,
    type: type || networks[networkIndex].type,
    active: networks[networkIndex].active,
    autostart: networks[networkIndex].autostart,
    vlanaware: type === 'vlan',
    ports: bridgePorts ? bridgePorts.join(', ') : networks[networkIndex].ports,
    cidr: cidr || networks[networkIndex].cidr,
    gateway: gateway || networks[networkIndex].gateway
  };
  
  networks[networkIndex] = updatedNetwork;
  
  // For now, just update in-memory. In a full implementation, you'd update /etc/network/interfaces
  // and restart networking
  res.json({ message: 'Network updated', network: updatedNetwork });
});

app.delete('/api/networks/:name', requireAuth, (req, res) => {
  const name = req.params.name;
  
  // First check if it's a user-created network
  const networkIndex = networks.findIndex(net => net.name === name);
  let networkType = null;
  if (networkIndex !== -1) {
    networkType = networks[networkIndex].type;
    // Remove from in-memory array
    networks.splice(networkIndex, 1);
  }
  
  // Remove bridge from QEMU bridge.conf if it's a bridge
  if (networkType === 'bridge') {
    try {
      const fs = require('fs');
      const bridgeConfPath = '/etc/qemu/bridge.conf';
      
      if (fs.existsSync(bridgeConfPath)) {
        let bridgeConfContent = fs.readFileSync(bridgeConfPath, 'utf8');
        const lines = bridgeConfContent.split('\n');
        
        // Remove the allow line for this bridge
        const filteredLines = lines.filter(line => line.trim() !== `allow ${name}`);
        
        // Write back the updated content
        fs.writeFileSync(bridgeConfPath, filteredLines.join('\n'));
        console.log(`Removed bridge ${name} from /etc/qemu/bridge.conf`);
      }
    } catch (error) {
      console.error('Error updating /etc/qemu/bridge.conf:', error);
      // Don't fail the entire operation if this fails
    }
  }
  
  // Try to remove from /etc/network/interfaces and bring down the interface
  const { exec } = require('child_process');
  const fs = require('fs');
  
  try {
    // Read current interfaces file
    let interfacesContent = fs.readFileSync('/etc/network/interfaces', 'utf8');
    
    // Remove the network configuration block
    const lines = interfacesContent.split('\n');
    const newLines = [];
    let skipBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`auto ${name}`) || lines[i].includes(`iface ${name}`)) {
        skipBlock = true;
        continue;
      }
      
      if (skipBlock) {
        // Skip indented lines (part of the interface block)
        if (lines[i].startsWith(' ') || lines[i].startsWith('\t') || lines[i] === '') {
          continue;
        } else {
          skipBlock = false;
        }
      }
      
      if (!skipBlock) {
        newLines.push(lines[i]);
      }
    }
    
    // Write back the updated content
    fs.writeFileSync('/etc/network/interfaces', newLines.join('\n'));
    
    // Disconnect interfaces from the bridge before deleting it
    exec(`brctl showbr ${name} 2>/dev/null | awk 'NR>1 {print $NF}'`, (brError, brStdout, brStderr) => {
      const interfaces = brStdout.trim().split('\n').filter(iface => iface && iface !== 'interfaces');
      
      // Disconnect each interface from the bridge
      const disconnectCommands = interfaces.map(iface => `brctl delif ${name} ${iface}`);
      
      if (disconnectCommands.length > 0) {
        disconnectCommands.forEach(cmd => {
          exec(cmd, (delError, delStdout, delStderr) => {
            if (!delError) {
              console.log(`Disconnected ${cmd.split(' ').pop()} from ${name}`);
            }
          });
        });
      }
      
      // Try to bring down the interface
      exec(`ifdown ${name}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error bringing down ${name}:`, error);
        } else {
          console.log(`Successfully brought down ${name}`);
        }
        
        // Try to delete the bridge if it exists
        exec(`ip link delete ${name}`, (delError, delStdout, delStderr) => {
          if (!delError) {
            console.log(`Deleted interface ${name}`);
          }
        });
      });
    });
    
  } catch (error) {
    console.error('Error updating /etc/network/interfaces:', error);
    // Continue anyway, as the in-memory removal succeeded
  }
  
  res.json({ message: 'Network deleted' });
});

// In-memory storage for networks (since we're not persisting to disk yet)
let networks = [];

// API routes for storages
const STORAGE_FILE = path.join(__dirname, 'storages.json');

// Default storages (fallback if file doesn't exist)
const DEFAULT_STORAGES = [
  { name: 'Local', type: 'Local', content: 'ISO Images', path: '/var/lib/idve/isos', shared: 'No', enabled: true },
  { name: 'Local', type: 'Local', content: 'Template', path: '/var/lib/idve/images', shared: 'No', enabled: true },
  { name: 'Local', type: 'Local', content: 'Disk images', path: '/var/lib/idve/instances', shared: 'No', enabled: true }
];

// Load storages from file or use defaults
function loadStorages() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading storages:', error);
  }
  return DEFAULT_STORAGES.slice(); // Return copy of defaults
}

// Save storages to file
function saveStorages(storages) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(storages, null, 2));
  } catch (error) {
    console.error('Error saving storages:', error);
  }
}

// Initialize storages
let storages = loadStorages();

// Helper function to get storage capacity and usage
function getStorageCapacity(storage, callback) {
  if (storage.type === 'RBD') {
    // For RBD storage, get pool usage
    const rbdStorage = storages.find(s => s.type === 'RBD' && s.pool === storage.pool);
    if (!rbdStorage) {
      return callback(null, 'N/A');
    }
    
    // Create temporary ceph.conf for this connection
    const cephConf = `[global]
mon host = ${rbdStorage.monitors.replace(/,/g, ':6789,')}:6789
auth cluster required = cephx
auth service required = cephx
auth client required = cephx
keyring = /dev/null
`;
    
    const tempConfPath = `/tmp/ceph-capacity-${Date.now()}.conf`;
    fs.writeFileSync(tempConfPath, cephConf);
    
    // Get RBD pool stats
    exec(`CEPH_CONF=${tempConfPath} rbd --id ${rbdStorage.username} --key ${rbdStorage.key} pool stats ${storage.pool}`, (error, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(tempConfPath); } catch (e) {}
      
      if (error) {
        console.error('Error getting RBD pool usage:', error);
        return callback(null, 'Error');
      }
      
      try {
        // Parse rbd pool stats output
        const lines = stdout.trim().split('\n');
        let provisionedSize = '0 B';
        
        lines.forEach(line => {
          if (line.startsWith('Provisioned Size:')) {
            provisionedSize = line.split(':')[1].trim();
          }
        });
        
        // For RBD, we show provisioned size as capacity info
        callback(null, provisionedSize);
      } catch (parseError) {
        console.error('Error parsing RBD pool stats:', parseError);
        callback(null, 'Parse Error');
      }
    });
  } else {
    // For local storage, get filesystem usage
    exec(`df -BG "${storage.path}" | tail -1`, (error, stdout, stderr) => {
      if (error) {
        console.error('Error getting local storage usage:', error);
        return callback(null, 'Error');
      }
      
      try {
        const parts = stdout.trim().split(/\s+/);
        if (parts.length >= 5) {
          const total = parts[1].replace('G', '');
          const used = parts[2].replace('G', '');
          const available = parts[3].replace('G', '');
          const usePercent = parts[4];
          
          callback(null, `${used}/${total} GB (${usePercent})`);
        } else {
          callback(null, 'N/A');
        }
      } catch (parseError) {
        console.error('Error parsing df output:', parseError);
        callback(null, 'Parse error');
      }
    });
  }
}

app.get('/api/storages', requireAuth, (req, res) => {
  // Add capacity information to each storage
  const storagesWithCapacity = storages.map(storage => ({ ...storage }));
  
  // Get capacity for all storages asynchronously
  const capacityPromises = storagesWithCapacity.map(storage => {
    return new Promise((resolve) => {
      getStorageCapacity(storage, (error, capacity) => {
        storage.capacity = capacity || 'Loading...';
        resolve();
      });
    });
  });
  
  Promise.all(capacityPromises).then(() => {
    res.json(storagesWithCapacity);
  }).catch(error => {
    console.error('Error getting storage capacities:', error);
    res.json(storagesWithCapacity); // Return with whatever capacity info we have
  });
});

app.post('/api/storages', requireAuth, (req, res) => {
  const { name, type, content, path, monitors, pool, username, key } = req.body;
  
  let newStorage;
  
  if (type === 'RBD') {
    // Validate RBD required fields
    if (!monitors || !pool || !username || !key) {
      return res.status(400).json({ error: 'Monitors, pool, username, and key are required for RBD storage' });
    }
    
    newStorage = {
      name,
      type,
      content,
      path: `rbd:${pool}`, // RBD path format
      monitors,
      pool,
      username,
      key,
      shared: 'Yes',
      enabled: true
    };
    
    // Test RBD connection
    const { exec } = require('child_process');
    // Create temporary ceph.conf for this connection
    const cephConf = `[global]
mon host = ${monitors.replace(/,/g, ':6789,')}:6789
auth cluster required = cephx
auth service required = cephx
auth client required = cephx
keyring = /dev/null
`;
    
    const fs = require('fs');
    const tempConfPath = `/tmp/ceph-${Date.now()}.conf`;
    fs.writeFileSync(tempConfPath, cephConf);
    
    const rbdCmd = `CEPH_CONF=${tempConfPath} rbd --id ${username} --key ${key} ls ${pool}`;
    
    exec(rbdCmd, (error, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(tempConfPath); } catch (e) {}
      
      if (error) {
        console.error('RBD connection test failed:', error);
        console.error('stderr:', stderr);
        return res.status(400).json({ error: 'Failed to connect to RBD cluster. Please check your configuration.' });
      }
      
      console.log('RBD connection successful, available images:', stdout);
      storages.push(newStorage);
      saveStorages(storages); // Save to persistent storage
      res.json({ message: 'RBD storage created and connected successfully' });
    });
  } else {
    // Handle other storage types (Local, NFS, iSCSI)
    if (!path) {
      return res.status(400).json({ error: 'Path is required for this storage type' });
    }
    
    newStorage = {
      name,
      type,
      content,
      path,
      shared: 'No',
      enabled: true
    };
    storages.push(newStorage);
    saveStorages(storages); // Save to persistent storage
    res.json({ message: 'Storage created' });
  }
});

app.put('/api/storages/:name', requireAuth, (req, res) => {
  const name = req.params.name;
  const { type, content, path, monitors, pool, username, key, shared, enabled } = req.body;
  
  const storageIndex = storages.findIndex(stor => stor.name === name);
  if (storageIndex === -1) {
    return res.status(404).json({ error: 'Storage not found' });
  }
  
  // Update storage properties
  if (type) storages[storageIndex].type = type;
  if (content) storages[storageIndex].content = content;
  if (path) storages[storageIndex].path = path;
  if (monitors) storages[storageIndex].monitors = monitors;
  if (pool) storages[storageIndex].pool = pool;
  if (username) storages[storageIndex].username = username;
  if (key) storages[storageIndex].key = key;
  if (shared !== undefined) storages[storageIndex].shared = shared;
  if (enabled !== undefined) storages[storageIndex].enabled = enabled;
  
  saveStorages(storages); // Save to persistent storage
  res.json({ message: 'Storage updated successfully' });
});

app.delete('/api/storages/:name', requireAuth, (req, res) => {
  const name = req.params.name;
  storages = storages.filter(stor => stor.name !== name);
  saveStorages(storages); // Save to persistent storage
  res.json({ message: 'Storage deleted' });
});

// Cloud-Init API routes
app.get('/api/cloudinit-templates', requireAuth, (req, res) => {
  // Return available Cloud-Init templates
  const templates = [
    { id: 'web-server', name: 'Web Server (LAMP)', description: 'Apache, MySQL, PHP stack' },
    { id: 'development', name: 'Development (Node.js)', description: 'Node.js development environment' },
    { id: 'database', name: 'Database (PostgreSQL)', description: 'PostgreSQL database server' },
    { id: 'custom', name: 'Custom', description: 'Custom Cloud-Init configuration' }
  ];
  res.json(templates);
});

app.post('/api/instances/cloudinit', requireAuth, (req, res) => {
  const {
    templateId,
    instanceName,
    ipAddress,
    sshKey,
    networkConfig,
    diskResize,
    diskSize,
    addTpm,
    storagePool,
    // Network Configuration
    bridge,
    vlanTag,
    networkModel,
    // User Configuration
    username,
    password,
    // Domain & DNS
    domain,
    dns1,
    dns2,
    // IP Configuration
    ipAddressCIDR,
    gateway
  } = req.body;

  if (!templateId || !instanceName || !username || !password) {
    return res.status(400).json({ error: 'Template ID, instance name, username, and password are required' });
  }

  // Load template
  const templatesDir = '/var/lib/idve/cloudinit-templates';
  const templatePath = `${templatesDir}/${templateId}.json`;

  if (!fs.existsSync(templatePath)) {
    return res.status(400).json({ error: 'Template not found' });
  }

  let template;
  try {
    template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  } catch (error) {
    console.error('Error loading template:', error);
    return res.status(500).json({ error: 'Failed to load template' });
  }

  // Check if base image exists
  const baseImagePath = `/var/lib/idve/images/${template.image}`;
  if (!fs.existsSync(baseImagePath)) {
    return res.status(400).json({ error: 'Base image not found' });
  }

  // Generate unique instance ID
  const instanceId = `cloudinit-${Date.now()}`;

  // Generate random MAC address for this instance
  function generateRandomMac() {
    const mac = ['52', '54', '00'];
    for (let i = 0; i < 3; i++) {
      mac.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
    }
    return mac.join(':');
  }
  const macAddress = generateRandomMac();

  // Create Cloud-Init user-data from template
  let userData = template.userDataTemplate
    .replace(/{{instanceName}}/g, instanceName)
    .replace(/{{username}}/g, username)
    .replace(/{{password}}/g, password)
    .replace(/{{sshKey}}/g, sshKey || '')
    .replace(/{{macAddress}}/g, macAddress);

  // // Add password if provided
  // if (password) {
  //   userData = userData.replace(/'${username || 'ubuntu'}':${password}|centos:centos|debian:debian|freebsd:freebsd|rocky:rocky/, `${username || 'ubuntu'}:${password}`);
  // }

  // Add disk resize command if enabled
  if (diskResize) {
    if (!userData.includes('growpart')) {
      userData += '\ngrowpart:\n  mode: auto\n  devices: [\'/\']\n  ignore_growroot_disabled: false\n';
    }
    if (!userData.includes('resize2fs')) {
      userData += '\nruncmd:\n  - growpart /dev/vda 1\n  - resize2fs /dev/vda1\n';
    }
  }

  // Add domain if provided
  if (domain) {
    userData += `\nmanage_etc_hosts: true\n`;
    userData = userData.replace(/{{hostname}}/g, `${instanceName}.${domain}`);
  } else {
    userData = userData.replace(/{{hostname}}/g, instanceName);
  }

  // Note: Network configuration is now handled in network-data file
  // The network config in user-data has been moved to network-data for better CloudInit compatibility

  // Add hostname/domain configuration
  if (domain) {
    userData += `\nhostname: ${instanceName}.${domain}\n`;
  } else {
    userData += `\nhostname: ${instanceName}\n`;
  }

  // Save user-data to file
  const userDataPath = `/var/lib/idve/cloudinit/${instanceId}-user-data`;
  const metaDataPath = `/var/lib/idve/cloudinit/${instanceId}-meta-data`;
  const networkDataPath = `/var/lib/idve/cloudinit/${instanceId}-network-data`;

  // Ensure cloudinit directory exists
  if (!fs.existsSync('/var/lib/idve/cloudinit')) {
    fs.mkdirSync('/var/lib/idve/cloudinit', { recursive: true });
  }

  // Create meta-data
  const metaData = `instance-id: ${instanceId}\nlocal-hostname: ${instanceName}\n`;

  // Create network-data if network configuration is enabled
  let networkData = '';
  if (networkConfig) {
    networkData = `version: 2\nethernets:\n  ens3:\n`;
    
    // Add MAC address matching
    networkData += `    match:\n      macaddress: "${macAddress}"\n`;
    networkData += `    set-name: ens3\n`;
    
    // Add IP configuration if provided
    if (ipAddressCIDR) {
      networkData += `    addresses:\n      - ${ipAddressCIDR}\n`;
    } else {
      networkData += `    dhcp4: true\n`;
    }

    // Add gateway if provided
    if (gateway) {
      networkData += `    gateway4: ${gateway}\n`;
    }

    // Add DNS servers if provided
    const dnsServers = [];
    if (dns1) dnsServers.push(dns1);
    if (dns2) dnsServers.push(dns2);
    if (dnsServers.length > 0) {
      networkData += `    nameservers:\n      addresses:\n`;
      dnsServers.forEach(dns => {
        networkData += `        - ${dns}\n`;
      });
    }
  }

  fs.writeFileSync(userDataPath, userData);
  fs.writeFileSync(metaDataPath, metaData);
  
  // Write network-data if network configuration is provided
  if (networkData) {
    fs.writeFileSync(networkDataPath, networkData);
  }
  
  // Create Cloud-Init ISO
  const cloudInitIsoPath = `/var/lib/idve/cloudinit/${instanceId}-cloudinit.iso`;
  const instanceDiskPath = `/var/lib/idve/instances/${instanceId}.qcow2`;
  
  // Create temporary directory for ISO contents
  const isoTempDir = `/tmp/cloudinit-${instanceId}`;
  if (!fs.existsSync(isoTempDir)) {
    fs.mkdirSync(isoTempDir, { recursive: true });
  }
  
  // Copy user-data and meta-data to ISO directory
  fs.copyFileSync(userDataPath, `${isoTempDir}/user-data`);
  fs.copyFileSync(metaDataPath, `${isoTempDir}/meta-data`);
  
  // Copy network-data if it exists
  if (networkData) {
    fs.copyFileSync(networkDataPath, `${isoTempDir}/network-config`);
  }
  
  // Create Cloud-Init ISO using genisoimage or mkisofs
  exec(`genisoimage -output ${cloudInitIsoPath} -volid cidata -joliet -rock ${isoTempDir}/`, (isoErr) => {
    // Clean up temporary directory
    exec(`rm -rf ${isoTempDir}`, () => {});
    
    if (isoErr) {
      console.error('Error creating Cloud-Init ISO:', isoErr);
      // Try alternative method with mkisofs
      exec(`mkisofs -output ${cloudInitIsoPath} -volid cidata -joliet -rock ${isoTempDir}/`, (mkErr) => {
        if (mkErr) {
          console.error('Error creating Cloud-Init ISO with mkisofs:', mkErr);
          return res.status(500).json({ error: 'Failed to create Cloud-Init ISO' });
        }
        createDisk();
      });
    } else {
      createDisk();
    }
  });

  function createDisk() {
    // Create disk from base image
    const baseImagePath = `/var/lib/idve/images/${template.image}`;

    // Ensure instances directory exists
    if (!fs.existsSync('/var/lib/idve/instances')) {
      fs.mkdirSync('/var/lib/idve/instances', { recursive: true });
    }

    // Copy base image to instance disk
    exec(`cp ${baseImagePath} ${instanceDiskPath}`, (copyErr) => {
      if (copyErr) {
        console.error('Error copying base image:', copyErr);
        return res.status(500).json({ error: 'Failed to create instance disk' });
      }

      // Handle disk sizing
      const resizeOperations = [];
      
      // If custom disk size is specified, resize to that size
      if (diskSize && parseInt(diskSize) > 0) {
        const targetSize = parseInt(diskSize);
        console.log(`Resizing CloudInit disk to ${targetSize}G: ${instanceDiskPath}`);
        resizeOperations.push(`qemu-img resize ${instanceDiskPath} ${targetSize}G`);
      } else if (diskResize) {
        // Default behavior: add 10G if diskResize is enabled
        console.log(`Resizing CloudInit disk +10G: ${instanceDiskPath}`);
        resizeOperations.push(`qemu-img resize ${instanceDiskPath} +10G`);
      }

      // Execute resize operations if any
      if (resizeOperations.length > 0) {
        exec(resizeOperations[0], (resizeErr) => {
          if (resizeErr) {
            console.error('Error resizing disk:', resizeErr);
            // Continue anyway, disk resize is optional
          }
          createInstanceConfig();
        });
      } else {
        createInstanceConfig();
      }
    });
  }

  function createInstanceConfig() {
    // Create instance configuration
    const instanceConfig = {
      id: instanceId,
      name: instanceName,
      host: 'localhost',
      osType: template.os,
      template: templateId,
      cloudInit: true,
      storagePool: storagePool || '/var/lib/idve/instances',
      userDataPath: userDataPath,
      metaDataPath: metaDataPath,
      cloudInitIsoPath: cloudInitIsoPath,
      diskPath: instanceDiskPath,
      diskSize: diskSize || null, // Store custom disk size if specified
      cpuSockets: 1,
      cpuCores: 2,
      cpuType: 'host',
      memory: 2048,
      // Network Configuration
      networkBridge: bridge || 'virbr0',
      vlanTag: vlanTag || null,
      networkModel: networkModel || 'virtio',
      macAddress: macAddress, // Add random MAC address
      // User Configuration
      username: username || null,
      password: password || null,
      // Domain & DNS
      domain: domain || null,
      dns1: dns1 || null,
      dns2: dns2 || null,
      // IP Configuration
      ipAddressCIDR: ipAddressCIDR || null,
      gateway: gateway || null,
      // Other settings
      graphics: 'virtio',
      machine: 'q35',
      bios: 'seabios',
      qemuAgent: true, // Enable qemu-guest-agent for IP detection
      addTpm: addTpm || false,
      createdAt: new Date().toISOString(),
      status: 'created'
    };

    // Add TPM configuration if enabled
    if (addTpm) {
      const tpmStatePath = `/var/lib/idve/instances/${instanceId}-tpm.raw`;
      const tpmSocketPath = `/var/run/idve/${instanceId}-tpm.sock`;
      const tpmPidPath = `/var/run/idve/${instanceId}-tpm.pid`;
      
      // Create TPM state file (4MB)
      const tpmStateSize = 4 * 1024 * 1024;
      if (!fs.existsSync(tpmStatePath)) {
        exec(`dd if=/dev/zero of=${tpmStatePath} bs=1 count=0 seek=${tpmStateSize}`, (ddErr) => {
          if (ddErr) {
            console.error('Error creating TPM state file:', ddErr);
          } else {
            console.log(`TPM state file created: ${tpmStatePath}`);
          }
        });
      }
      
      instanceConfig.tpmStatePath = tpmStatePath;
      instanceConfig.tpmSocketPath = tpmSocketPath;
      instanceConfig.tpmPidPath = tpmPidPath;
    }

    // Save instance configuration
    const configPath = `/etc/idve/${instanceId}.json`;
    fs.writeFileSync(configPath, JSON.stringify(instanceConfig, null, 2));
    console.log(`Cloud-Init instance configuration saved to ${configPath}`);

    res.json({
      success: true,
      message: 'Cloud-Init instance created successfully',
      instanceId: instanceId,
      config: instanceConfig
    });
  }
});

// Socket for terminal
io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('start-terminal', (instanceId) => {
    // Start QEMU with serial console or something
    const qemu = spawn('qemu-system-x86_64', ['-monitor', 'stdio', '-serial', 'pty'], { stdio: ['pipe', 'pipe', 'pipe'] });
    // Handle terminal interaction
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});