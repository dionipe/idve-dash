const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

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
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for host resource monitoring
app.get('/api/host-resources', (req, res) => {
  const resources = {
    cpu: { used: 0, total: 100 },
    memory: { used: 0, total: 0 },
    storage: { used: 0, total: 0 }
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

        res.json(resources);
      });
    });
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

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API routes for VMs
app.get('/api/instances', (req, res) => {
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

app.get('/api/instances/:id', (req, res) => {
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

app.post('/api/instances', (req, res) => {
  const {
    name, instanceId, host, osType, cdrom, cdroms, graphics, machine, bios, scsiController,
    addTpm, qemuAgent, diskBus, diskScsiController, storagePool, diskSize,
    cpuSockets, cpuCores, cpuType, memory, balloonDevice, networkBridge,
    vlanTag, networkModel, macAddress, startAfterCreate
  } = req.body;

  // Handle both single cdrom and cdroms array for backward compatibility
  const allCdroms = cdroms || (cdrom ? [cdrom] : []);

  // Build QEMU command with all parameters
  let qemuCmd = `qemu-system-x86_64 -name ${name} -m ${memory} -smp sockets=${cpuSockets},cores=${cpuCores} -cpu ${cpuType}`;

  // Add machine type
  qemuCmd += ` -machine ${machine}`;

  // Add BIOS
  if (bios === 'ovmf') {
    qemuCmd += ' -bios /usr/share/ovmf/OVMF.fd'; // Adjust path as needed
  }

  // Add disk
  const diskPath = `${storagePool}/${name}.qcow2`;
  qemuCmd += ` -drive file=${diskPath},if=${diskBus === 'virtio' ? 'virtio' : diskBus},format=qcow2`;

  // Add CDROM(s) if specified
  allCdroms.forEach((cdromPath) => {
    if (cdromPath) {
      qemuCmd += ` -cdrom ${cdromPath}`;
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

  // Add SCSI controller if needed
  if (diskBus === 'scsi' || scsiController) {
    qemuCmd += ` -device ${scsiController}`;
  }

  // Add TPM if requested
  if (addTpm) {
    qemuCmd += ' -tpmdev passthrough,id=tpm0,path=/dev/tpm0 -device tpm-tis,tpmdev=tpm0';
  }

  // Add QEMU agent
  if (qemuAgent) {
    qemuCmd += ` -device virtio-serial -chardev socket,path=/var/lib/libvirt/qemu/${name}.agent,server,nowait,id=${name}_agent -device virtserialport,chardev=${name}_agent,name=org.qemu.guest_agent.0`;
  }

  // Add balloon device
  if (balloonDevice) {
    qemuCmd += ' -device virtio-balloon';
  }

  // Boot order
  qemuCmd += allCdroms.length > 0 ? ' -boot order=dc' : ' -boot order=c';

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

app.put('/api/instances/:id', (req, res) => {
  const instanceId = req.params.id;
  const configPath = `/etc/idve/${instanceId}.json`;
  
  try {
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const updatedConfig = { ...existingConfig, ...req.body, updatedAt: new Date().toISOString() };
    
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    console.log(`Instance configuration updated: ${configPath}`);
    
    res.json({ message: 'Instance updated successfully', config: updatedConfig });
  } catch (error) {
    console.error(`Error updating instance ${instanceId}:`, error);
    res.status(500).json({ error: 'Failed to update instance configuration' });
  }
});

app.put('/api/instances/:id/start', (req, res) => {
  const instanceId = req.params.id;
  const configPath = `/etc/idve/${instanceId}.json`;
  
  try {
    // Check if instance config exists
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    // Read instance config first
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Check if already running
    exec(`ps aux | grep 'qemu-system-x86_64.*-name "${config.name}"' | grep -v grep`, (error, stdout, stderr) => {
      if (stdout.trim() !== '') {
        return res.status(400).json({ error: 'Instance is already running' });
      }
      
      // Build QEMU command
      let cpuModel = config.cpuType || 'qemu64';
      // Fallback to qemu64 if host CPU is requested but KVM might not be available
      if (cpuModel === 'host') {
        cpuModel = 'qemu64';
      }
      let qemuCmd = `qemu-system-x86_64 -enable-kvm -name "${config.name}" -m ${config.memory} -smp sockets=${config.cpuSockets},cores=${config.cpuCores} -cpu ${cpuModel}`;
      
      // Add machine type
      qemuCmd += ` -machine q35`;
      
      // Add BIOS
      if (config.bios === 'ovmf') {
        qemuCmd += ' -bios /usr/share/ovmf/OVMF.fd';
      }
      
        // Add disk
        const storagePool = config.storagePool || '/var/lib/idve/instances';
        const diskPath = `${storagePool}/${config.id}.qcow2`;
        console.log(`Disk path: ${diskPath}`);
        
        // Create disk if it doesn't exist
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
        
        function startQemu() {
          // Simplified QEMU command that works
          qemuCmd += ` -drive file=${diskPath},if=virtio,format=qcow2`;
          
          // Add Cloud-Init drive if this is a Cloud-Init instance
          if (config.cloudInit && config.cloudInitIsoPath) {
            qemuCmd += ` -drive file=${config.cloudInitIsoPath},if=virtio,format=raw`;
          }
          
          // Add CDROM(s) if specified
          const cdroms = config.cdroms || (config.cdrom ? [config.cdrom] : []);
          cdroms.forEach((cdrom, index) => {
            if (cdrom) {
              qemuCmd += ` -cdrom ${cdrom}`;
            }
          });
          
          // Add network using bridge from config
          if (config.networkBridge) {
            qemuCmd += ` -net nic,model=${config.networkModel || 'virtio'}`;
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
            qemuCmd += ` -device virtio-serial -chardev socket,path=/var/lib/libvirt/qemu/${config.id}.agent,server,nowait,id=agent_${config.id} -device virtserialport,chardev=agent_${config.id},name=org.qemu.guest_agent.0`;
          }
          
          // Add balloon device
          if (config.balloonDevice) {
            qemuCmd += ' -device virtio-balloon';
          }
          
          // Boot order
          qemuCmd += cdroms.length > 0 ? ' -boot order=dc' : ' -boot order=c';
          
          // Daemonize for background execution
          qemuCmd += ' -daemonize';
          
          console.log(`QEMU command: ${qemuCmd}`);
        
        // Start QEMU in background using spawn
        const qemuArgs = qemuCmd.split(' ').slice(1); // Remove 'qemu-system-x86_64' from args
        console.log('QEMU args:', qemuArgs);
        
        const qemuProcess = spawn('qemu-system-x86_64', qemuArgs, {
          detached: true,
          stdio: 'ignore'
        });
        
        qemuProcess.on('error', (err) => {
          console.error('Failed to start QEMU process:', err);
        });
        
        qemuProcess.on('exit', (code, signal) => {
          console.log(`QEMU process exited with code ${code} and signal ${signal}`);
        });
        
        qemuProcess.unref(); // Allow parent to exit independently
        
        // Start websockify for VNC proxy (use different port for WebSocket)
        const instanceNum = parseInt(config.id.replace(/\D/g, '')) % 1000; // Keep port numbers reasonable
        const qemuVncPort = 5900 + instanceNum; // Exact VNC port QEMU will use
        const baseWsPort = 7900 + instanceNum; // WebSocket port
        
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
        
        // Update instance status
        config.status = 'running';
        config.startedAt = new Date().toISOString();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        res.json({ message: 'Instance started successfully' });
      }
    });
  } catch (error) {
    console.error('Error starting instance:', error);
    res.status(500).json({ error: 'Failed to start instance' });
  }
});

app.put('/api/instances/:id/stop', (req, res) => {
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
    exec(`pkill -f 'qemu-system-x86_64.*-name "${instanceName}"'`, (error, stdout, stderr) => {
      // Note: pkill returns error if no processes found, but that's OK for us
      // as it means the instance is already stopped
      
      // Also kill websockify process for this instance
      const instanceNum = parseInt(instanceId.replace(/\D/g, '')) % 1000; // Keep port numbers reasonable
      const wsPort = 7900 + instanceNum;
      // Kill websockify processes in a range around the expected port
      exec(`pkill -f "websockify.*${wsPort}" || pkill -f "websockify.*$((wsPort-5))" || pkill -f "websockify.*$((wsPort+5))"`, (wsError, wsOut, wsStderr) => {
        // Note: pkill returns error if no processes found, that's OK
        console.log(`Stopped websockify processes around port ${wsPort}`);
      });
      
      // Update instance status
      config.status = 'stopped';
      config.stoppedAt = new Date().toISOString();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      res.json({ message: 'Instance stopped successfully' });
    });
  } catch (error) {
    console.error('Error stopping instance:', error);
    res.status(500).json({ error: 'Failed to stop instance' });
  }
});

app.delete('/api/instances/:id', (req, res) => {
  const instanceId = req.params.id;
  const diskPath = `/var/lib/idve/instances/${instanceId}.qcow2`;
  const configPath = `/etc/idve/${instanceId}.json`;
  
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
      
      res.json({ message: 'Instance deleted successfully' });
    });
  });
});

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
    exec(`ps aux | grep 'qemu-system-x86_64.*-name "${instanceName}"' | grep -v grep`, (error, stdout, stderr) => {
      const isRunning = stdout.trim() !== '';
      res.json({ 
        instanceId: instanceId,
        isRunning: isRunning,
        status: isRunning ? 'running' : 'stopped'
      });
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
app.get('/api/images', (req, res) => {
  const imagesDir = '/var/lib/idve/images';
  fs.readdir(imagesDir, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(files);
  });
});

app.get('/api/isos', (req, res) => {
  const isosDir = '/var/lib/idve/isos';
  fs.readdir(isosDir, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(files);
  });
});

// API routes for networks
app.get('/api/networks', (req, res) => {
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

app.post('/api/networks', (req, res) => {
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

app.put('/api/networks/:name', (req, res) => {
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

app.delete('/api/networks/:name', (req, res) => {
  const name = req.params.name;
  
  // First check if it's a user-created network
  const networkIndex = networks.findIndex(net => net.name === name);
  if (networkIndex !== -1) {
    // Remove from in-memory array
    networks.splice(networkIndex, 1);
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
let storages = [
  { name: 'Local', type: 'Local', content: 'ISO Images', path: '/var/lib/idve/isos', shared: 'No', enabled: true },
  { name: 'Local', type: 'Local', content: 'Template', path: '/var/lib/idve/images', shared: 'No', enabled: true },
  { name: 'Local', type: 'Local', content: 'Disk images', path: '/var/lib/idve/instances', shared: 'No', enabled: true }
];

app.get('/api/storages', (req, res) => {
  res.json(storages);
});

app.post('/api/storages', (req, res) => {
  const { name, type, content, path } = req.body;
  const newStorage = {
    name,
    type,
    content,
    path,
    shared: 'No',
    enabled: true
  };
  storages.push(newStorage);
  res.json({ message: 'Storage created' });
});

app.delete('/api/storages/:name', (req, res) => {
  const name = req.params.name;
  storages = storages.filter(stor => stor.name !== name);
  res.json({ message: 'Storage deleted' });
});

// Cloud-Init API routes
app.get('/api/cloudinit-templates', (req, res) => {
  // Return available Cloud-Init templates
  const templates = [
    { id: 'web-server', name: 'Web Server (LAMP)', description: 'Apache, MySQL, PHP stack' },
    { id: 'development', name: 'Development (Node.js)', description: 'Node.js development environment' },
    { id: 'database', name: 'Database (PostgreSQL)', description: 'PostgreSQL database server' },
    { id: 'custom', name: 'Custom', description: 'Custom Cloud-Init configuration' }
  ];
  res.json(templates);
});

app.post('/api/instances/cloudinit', (req, res) => {
  const {
    template,
    os,
    instanceName,
    ipAddress,
    sshKey,
    networkConfig,
    diskResize,
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

  // Generate unique instance ID
  const instanceId = `cloudinit-${Date.now()}`;

  // Determine OS-specific settings
  let osSettings = {};
  switch (os) {
    case 'ubuntu-22.04':
      osSettings = {
        image: 'ubuntu-22.04-server-cloudimg-amd64.img',
        userDataTemplate: '#cloud-config\npackage_update: true\npackage_upgrade: true\npackages:\n  - curl\n  - wget\nusers:\n  - name: ubuntu\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    groups: users, admin\n    home: /home/ubuntu\n    shell: /bin/bash\n    lock_passwd: false\n    ssh-authorized-keys:\n      - ${SSH_KEY}\nssh_pwauth: false\nchpasswd:\n  list: |\n    ubuntu:ubuntu\n  expire: false\n'
      };
      break;
    case 'centos-stream-9':
      osSettings = {
        image: 'centos-stream-9-x86_64-boot.iso',
        userDataTemplate: '#cloud-config\npackage_update: true\npackage_upgrade: true\npackages:\n  - curl\n  - wget\nusers:\n  - name: centos\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    groups: users, wheel\n    home: /home/centos\n    shell: /bin/bash\n    lock_passwd: false\n    ssh-authorized-keys:\n      - ${SSH_KEY}\nssh_pwauth: false\nchpasswd:\n  list: |\n    centos:centos\n  expire: false\n'
      };
      break;
    case 'debian-11':
      osSettings = {
        image: 'debian-11-genericcloud-amd64.qcow2',
        userDataTemplate: '#cloud-config\npackage_update: true\npackage_upgrade: true\npackages:\n  - curl\n  - wget\nusers:\n  - name: debian\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    groups: users, sudo\n    home: /home/debian\n    shell: /bin/bash\n    lock_passwd: false\n    ssh-authorized-keys:\n      - ${SSH_KEY}\nssh_pwauth: false\nchpasswd:\n  list: |\n    debian:debian\n  expire: false\n'
      };
      break;
    case 'rocky-9':
      osSettings = {
        image: 'rocky-9-x86_64-boot.iso',
        userDataTemplate: '#cloud-config\npackage_update: true\npackage_upgrade: true\npackages:\n  - curl\n  - wget\nusers:\n  - name: rocky\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    groups: users, wheel\n    home: /home/rocky\n    shell: /bin/bash\n    lock_passwd: false\n    ssh-authorized-keys:\n      - ${SSH_KEY}\nssh_pwauth: false\nchpasswd:\n  list: |\n    rocky:rocky\n  expire: false\n'
      };
      break;
    default:
      return res.status(400).json({ error: 'Unsupported OS' });
  }

  // Apply template-specific packages
  let additionalPackages = [];
  switch (template) {
    case 'web-server':
      additionalPackages = ['apache2', 'mysql-server', 'php', 'php-mysql'];
      break;
    case 'development':
      additionalPackages = ['nodejs', 'npm', 'git', 'build-essential'];
      break;
    case 'database':
      additionalPackages = ['postgresql', 'postgresql-contrib'];
      break;
  }

  // Create Cloud-Init user-data
  let userData = osSettings.userDataTemplate;

  // Add custom username and password if provided
  if (username) {
    // Replace default username in user-data
    const defaultUser = osSettings.userDataTemplate.match(/name: (\w+)/)[1];
    userData = userData.replace(new RegExp(`name: ${defaultUser}`, 'g'), `name: ${username}`);
    userData = userData.replace(new RegExp(`/home/${defaultUser}`, 'g'), `/home/${username}`);
    userData = userData.replace(new RegExp(`${defaultUser}:${defaultUser}`, 'g'), `${username}:${password || username}`);
  }

  // Add password if provided
  if (password) {
    userData = userData.replace(/ubuntu:ubuntu|centos:centos|debian:debian|rocky:rocky/, `${username || 'ubuntu'}:${password}`);
  }

  if (additionalPackages.length > 0) {
    userData += '\npackages:\n' + additionalPackages.map(pkg => `  - ${pkg}`).join('\n');
  }

  // Add SSH key if provided
  if (sshKey) {
    userData = userData.replace('${SSH_KEY}', sshKey);
  } else {
    // Remove SSH key section if not provided
    userData = userData.replace(/\s*ssh-authorized-keys:[\s\S]*?(?=\n\w|$)/, '');
  }

  // Add domain if provided
  if (domain) {
    userData += `\nmanage_etc_hosts: true\n`;
  }

  // Add network configuration if enabled
  if (networkConfig) {
    let networkConfigStr = `\nnetwork:\n  version: 2\n  ethernets:\n    ens3:\n`;

    // Add IP configuration if provided
    if (ipAddressCIDR) {
      networkConfigStr += `      addresses:\n        - ${ipAddressCIDR}\n`;
    }

    // Add gateway if provided
    if (gateway) {
      networkConfigStr += `      gateway4: ${gateway}\n`;
    }

    // Add DNS servers if provided
    const dnsServers = [];
    if (dns1) dnsServers.push(dns1);
    if (dns2) dnsServers.push(dns2);
    if (dnsServers.length > 0) {
      networkConfigStr += `      nameservers:\n        addresses:\n`;
      dnsServers.forEach(dns => {
        networkConfigStr += `          - ${dns}\n`;
      });
    }

    userData += networkConfigStr;
  }

  // Add hostname/domain configuration
  if (domain) {
    userData += `\nhostname: ${instanceName}.${domain}\n`;
  } else {
    userData += `\nhostname: ${instanceName}\n`;
  }

  // Save user-data to file
  const userDataPath = `/var/lib/idve/cloudinit/${instanceId}-user-data`;
  const metaDataPath = `/var/lib/idve/cloudinit/${instanceId}-meta-data`;

  // Ensure cloudinit directory exists
  if (!fs.existsSync('/var/lib/idve/cloudinit')) {
    fs.mkdirSync('/var/lib/idve/cloudinit', { recursive: true });
  }

  // Create meta-data
  const metaData = `instance-id: ${instanceId}\nlocal-hostname: ${instanceName}\n`;

  fs.writeFileSync(userDataPath, userData);
  fs.writeFileSync(metaDataPath, metaData);

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
    const baseImagePath = `/var/lib/idve/images/${osSettings.image}`;

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

      // Resize disk if requested
      if (diskResize) {
        exec(`qemu-img resize ${instanceDiskPath} +10G`, (resizeErr) => {
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
      osType: os,
      template: template,
      cloudInit: true,
      userDataPath: userDataPath,
      metaDataPath: metaDataPath,
      cloudInitIsoPath: cloudInitIsoPath,
      diskPath: instanceDiskPath,
      cpuSockets: 1,
      cpuCores: 2,
      cpuType: 'host',
      memory: 2048,
      // Network Configuration
      networkBridge: bridge || 'virbr0',
      vlanTag: vlanTag || null,
      networkModel: networkModel || 'virtio',
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
      createdAt: new Date().toISOString(),
      status: 'created'
    };

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