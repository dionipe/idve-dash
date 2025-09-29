// Generate random MAC address for VMs
function generateRandomMac() {
  const mac = ['52', '54', '00']; // QEMU OUI prefix
  for (let i = 0; i < 3; i++) {
    mac.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
  }
  return mac.join(':');
}

// Global variables
let isLoadingInstances = false;
let currentStep = 0;
let totalSteps = 3;

function showCreateInstanceModal() {
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal').classList.add('flex');
  currentStep = 0;
  showStep(currentStep);
  populateISOs();
  populateBridges();
  populateStoragePools();

  // Reset form state for new instance creation
  const form = document.getElementById('create-instance-form');
  form.reset();
  delete form.dataset.instanceId;
  document.getElementById('create-btn').textContent = 'Create Instance';

  // Set hostname dynamically
  document.getElementById('host').value = window.location.hostname || 'idve-08';

  // Add event listener for OS type changes to set Windows defaults
  // setupOSTypeListener(); // Moved to global scope
}

function setupOSTypeListener() {
  const osTypeSelect = document.getElementById('os-type');
  if (osTypeSelect) {
    osTypeSelect.addEventListener('change', function() {
      const selectedOS = this.value;
      if (selectedOS === 'windows') {
        // Set Windows-specific defaults for best performance (per Proxmox best practices)
        const biosEl = document.getElementById('bios');
        const machineEl = document.getElementById('machine');
        const tpmEl = document.getElementById('add-tpm');
        const qemuEl = document.getElementById('qemu-agent');
        const balloonEl = document.getElementById('balloon-device');
        const cpuEl = document.getElementById('cpu-type');
        const networkEl = document.getElementById('network-model');
        
        if (biosEl) biosEl.value = 'ovmf';
        if (machineEl) machineEl.value = 'q35';
        if (tpmEl) tpmEl.checked = true;
        if (qemuEl) qemuEl.checked = true; // Enable QEMU Agent for Windows
        if (balloonEl) balloonEl.checked = true; // Enable balloon device for dynamic memory
        if (cpuEl) cpuEl.value = 'Skylake-Client-v3';
        if (networkEl) networkEl.value = 'virtio'; // VirtIO for best performance
      } else if (selectedOS === 'linux') {
        // Set Linux defaults
        const biosEl = document.getElementById('bios');
        const machineEl = document.getElementById('machine');
        const tpmEl = document.getElementById('add-tpm');
        const qemuEl = document.getElementById('qemu-agent');
        
        if (biosEl) biosEl.value = 'seabios';
        if (machineEl) machineEl.value = 'pc';
        if (tpmEl) tpmEl.checked = false;
        if (qemuEl) qemuEl.checked = true; // Keep enabled for Linux too
      }
      // For 'other', keep current values
    });
  }
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal').classList.remove('flex');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  document.getElementById('edit-modal').classList.remove('flex');
}

function showStep(step) {
  const steps = document.querySelectorAll('.step');
  steps.forEach((stepElement, index) => {
    if (index === step) {
      stepElement.classList.remove('hidden');
    } else {
      stepElement.classList.add('hidden');
    }
  });

  // Update navigation buttons
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const createBtn = document.getElementById('create-btn');

  if (prevBtn) {
    prevBtn.disabled = step === 0;
  }
  if (nextBtn) {
    nextBtn.style.display = step === totalSteps - 1 ? 'none' : 'block';
  }
  if (createBtn) {
    createBtn.style.display = step === totalSteps - 1 ? 'block' : 'none';
  }
}

function nextStep() {
  if (currentStep < totalSteps - 1) {
    currentStep++;
    showStep(currentStep);
    if (currentStep === totalSteps - 1) {
      generateSummary();
    }
  }
}

function prevStep() {
  if (currentStep > 0) {
    currentStep--;
    showStep(currentStep);
  }
}

function generateSummary() {
  const formData = new FormData(document.getElementById('create-instance-form'));
  const summaryTable = document.getElementById('config-summary');

  // Generate MAC address preview if not provided
  let macAddressDisplay = formData.get('macAddress');
  if (!macAddressDisplay || macAddressDisplay.trim() === '') {
    macAddressDisplay = 'Auto-generated (52:54:00:XX:XX:XX)';
  }

  const summaryData = [
    { key: 'Host/Node', value: formData.get('host') },
    { key: 'Instance ID', value: formData.get('instanceId') },
    { key: 'Name', value: formData.get('name') },
    { key: 'OS Type', value: formData.get('osType') },
    { key: 'CDROM', value: formData.get('cdrom') || 'None' },
    { key: 'Graphics', value: formData.get('graphics') || 'virtio' },
    { key: 'Machine', value: formData.get('machine') || 'pc' },
    { key: 'BIOS', value: formData.get('bios') || 'seabios' },
    { key: 'SCSI Controller', value: formData.get('scsiController') || 'virtio-scsi-pci' },
    { key: 'TPM', value: formData.get('addTpm') === 'on' ? 'Yes' : 'No' },
    { key: 'QEMU Agent', value: formData.get('qemuAgent') === 'on' ? 'Yes' : 'No' },
    { key: 'Disk Bus', value: formData.get('diskBus') || 'virtio' },
    { key: 'Disk SCSI Controller', value: formData.get('diskScsiController') || 'virtio-scsi-pci' },
    { key: 'Storage Pool', value: formData.get('storagePool') || 'Default' },
    { key: 'Disk Size', value: `${formData.get('diskSize')} GiB` },
    { key: 'CPU Sockets', value: formData.get('cpuSockets') || '1' },
    { key: 'CPU Cores', value: formData.get('cpuCores') || '2' },
    { key: 'CPU Type', value: formData.get('cpuType') || 'host' },
    { key: 'Memory', value: `${formData.get('memory')} MiB` },
    { key: 'Balloon Device', value: formData.get('balloonDevice') === 'on' ? 'Yes' : 'No' },
    { key: 'Network Bridge', value: formData.get('networkBridge') || 'None' },
    { key: 'VLAN Tag', value: formData.get('vlanTag') || 'None' },
    { key: 'Network Model', value: formData.get('networkModel') || 'virtio' },
    { key: 'MAC Address', value: macAddressDisplay },
    { key: 'Start After Create', value: formData.get('startAfterCreate') === 'on' ? 'Yes' : 'No' }
  ];

  summaryTable.innerHTML = '';
  summaryData.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="py-1">${item.key}</td>
      <td class="py-1">${item.value}</td>
    `;
    summaryTable.appendChild(row);
  });
}

function createInstance() {
  const form = document.getElementById('create-instance-form');
  const formData = new FormData(form);

  const instanceId = formData.get('instanceId');
  if (!instanceId || instanceId.trim() === '') {
    alert('Instance ID is required');
    return;
  }

  // Auto-generate MAC address if not provided
  let macAddress = formData.get('macAddress');
  if (!macAddress || macAddress.trim() === '') {
    macAddress = generateRandomMac();
  }

  const instanceData = {
    instanceId: instanceId.trim(),
    name: formData.get('name'),
    host: formData.get('host'),
    osType: formData.get('osType'),
    cdrom: formData.get('cdrom'),
    graphics: formData.get('graphics') || 'virtio',
    machine: formData.get('machine') || 'pc',
    bios: formData.get('bios') || 'seabios',
    scsiController: formData.get('scsiController') || 'virtio-scsi-pci',
    addTpm: formData.get('addTpm') === 'on',
    qemuAgent: formData.get('qemuAgent') === 'on',
    diskBus: formData.get('diskBus') || 'virtio',
    diskScsiController: formData.get('diskScsiController') || 'virtio-scsi-pci',
    storagePool: formData.get('storagePool'),
    diskSize: formData.get('diskSize'),
    cpuSockets: parseInt(formData.get('cpuSockets')) || 1,
    cpuCores: parseInt(formData.get('cpuCores')) || 2,
    cpuType: formData.get('cpuType') || 'host',
    memory: parseInt(formData.get('memory')) || 2048,
    balloonDevice: formData.get('balloonDevice') === 'on',
    networkBridge: formData.get('networkBridge'),
    vlanTag: formData.get('vlanTag'),
    networkModel: formData.get('networkModel') || 'virtio',
    macAddress: macAddress,
    startAfterCreate: formData.get('startAfterCreate') === 'on'
  };

  fetch('/api/instances', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(instanceData),
  })
  .then(response => response.json())
  .then(data => {
    if (data.message) {
      alert(`Instance created successfully!`);
      closeModal();
      loadInstances();
      loadDashboard();
    } else {
      alert(`Error: ${data.error}`);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert(`Failed to create instance: ${error.message}`);
  });
}

function startInstance(instanceId) {
  fetch(`/api/instances/${instanceId}/start`, {
    method: 'PUT',
    credentials: 'include',
  })
  .then(response => response.json())
  .then(data => {
    if (data.message) {
      alert(`Instance started successfully!`);
      // Wait a moment for the start operation to complete
      setTimeout(() => {
        loadInstances();
        loadDashboard();
      }, 2000);
    } else {
      alert(`Error: ${data.error}`);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert(`Failed to start instance: ${error.message}`);
  });
}

function stopInstance(instanceId) {
  fetch(`/api/instances/${instanceId}/stop`, {
    method: 'PUT',
    credentials: 'include',
  })
  .then(response => response.json())
  .then(data => {
    if (data.message) {
      alert(`Instance stopped successfully!`);
      // Wait a moment for the stop operation to complete
      setTimeout(() => {
        loadInstances();
        loadDashboard();
      }, 2000);
    } else {
      alert(`Error: ${data.error}`);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert(`Failed to stop instance: ${error.message}`);
  });
}

function deleteInstance(instanceId) {
  if (confirm('Are you sure you want to delete this instance? This action cannot be undone.')) {
    // First check if instance is running
    fetch(`/api/instances/${instanceId}/status`, {
      credentials: 'include'
    })
    .then(response => response.json())
    .then(statusData => {
      if (statusData.isRunning) {
        // Instance is running, stop it first
        alert('Instance is currently running. Stopping it before deletion...');
        return fetch(`/api/instances/${instanceId}/stop`, {
          method: 'PUT',
          credentials: 'include',
        })
        .then(response => response.json())
        .then(stopData => {
          if (stopData.message) {
            alert('Instance stopped successfully. Now deleting...');
            // Wait a moment for the stop to complete
            return new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            throw new Error(stopData.error || 'Failed to stop instance');
          }
        });
      } else {
        // Instance is already stopped, proceed with deletion
        return Promise.resolve();
      }
    })
    .then(() => {
      // Now proceed with deletion
      return fetch(`/api/instances/${instanceId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    })
    .then(response => response.json())
    .then(data => {
      if (data.message) {
        alert(`Instance deleted successfully!`);
        loadInstances();
        loadDashboard();
      } else {
        alert(`Error: ${data.error}`);
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alert(`Failed to delete instance: ${error.message}`);
    });
  }
}

function editInstance(instanceId) {
  fetch(`/api/instances/${instanceId}`, {
    credentials: 'include'
  })
  .then(response => response.json())
  .then(data => {
    // Store instance ID
    document.getElementById('edit-instance-form').dataset.instanceId = instanceId;

    // Helper function to set field value and trigger floating label
    function setFieldValue(fieldId, value) {
      const field = document.getElementById(fieldId);
      if (field) {
        field.value = value;
        // Trigger input event to update floating label
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // Populate basic hardware fields
    setFieldValue('edit-processor', data.cpuType || 'host');
    setFieldValue('edit-memory-gb', Math.round((data.memory || 2048) / 1024));
    setFieldValue('edit-bios', data.bios || 'seabios');
    setFieldValue('edit-graphics', data.graphics || 'virtio');
    setFieldValue('edit-machine', data.machine || 'pc');
    setFieldValue('edit-scsi-controller', data.scsiController || 'virtio-scsi-pci');
    setFieldValue('edit-disk-size', data.diskSize || '10');
    setFieldValue('edit-os-type', data.osType || 'linux');

    // Cloud-Init fields
    setFieldValue('edit-user', data.username || '');
    setFieldValue('edit-password', data.password || '');
    setFieldValue('edit-domain', data.domain || '');
    setFieldValue('edit-dns1', data.dns1 || '');
    setFieldValue('edit-dns2', data.dns2 || '');
    setFieldValue('edit-ip-address-cidr', data.ipAddressCIDR || '');
    setFieldValue('edit-gateway', data.gateway || '');
    setFieldValue('edit-ssh-key', data.sshKey || '');
    setFieldValue('edit-vlan-tag', data.vlanTag || '');
    setFieldValue('edit-network-model', data.networkModel || 'virtio');

    // Set checkboxes
    const networkConfigCheckbox = document.getElementById('edit-network-config');
    if (networkConfigCheckbox) {
      networkConfigCheckbox.checked = data.networkConfig !== false; // Default to true if not specified
    }
    const diskResizeCheckbox = document.getElementById('edit-disk-resize');
    if (diskResizeCheckbox) {
      diskResizeCheckbox.checked = data.diskResize !== false; // Default to true if not specified
    }
    const tpmCheckbox = document.getElementById('edit-tpm');
    if (tpmCheckbox) {
      tpmCheckbox.checked = data.addTpm === true;
    }

    // Options fields
    setFieldValue('edit-start-boot', (data.startAfterCreate || data.startBoot) ? 'true' : 'false');
    setFieldValue('edit-boot-order', data.bootOrder || '');
    setFieldValue('edit-hotplug', data.hotplug !== undefined ? data.hotplug.toString() : 'true');
    setFieldValue('edit-kvm-virtualization', data.kvmVirtualization !== undefined ? data.kvmVirtualization.toString() : 'true');

    // Populate dropdowns and set values after they load
    Promise.all([
      populateEditBridges().then(() => {
        // Set network bridge value after dropdown is populated
        setTimeout(() => {
          const networkBridgeSelect = document.getElementById('edit-network-bridge');
          if (networkBridgeSelect && data.networkBridge) {
            networkBridgeSelect.value = data.networkBridge;
            networkBridgeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, 100);
      }),
      populateCloudInitBridges().then(() => {
        // Set Cloud-Init bridge value after dropdown is populated
        setTimeout(() => {
          const cloudInitBridgeSelect = document.getElementById('edit-cloudinit-bridge');
          if (cloudInitBridgeSelect && data.bridge) {
            cloudInitBridgeSelect.value = data.bridge;
            cloudInitBridgeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, 100);
      }),
      populateEditISOs().then(() => {
        // Clear existing additional CD drives
        const cdContainer = document.getElementById('cd-drives-container');
        cdContainer.innerHTML = '';

        // Handle multiple CD drives
        const cdroms = data.cdroms || (data.cdrom ? [data.cdrom] : []);

        // Set first CDROM value
        setTimeout(() => {
          const cdromSelect = document.getElementById('edit-cdrom');
          if (cdromSelect && cdroms.length > 0) {
            cdromSelect.value = cdroms[0];
            cdromSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }

          // Add additional CD drives if any
          for (let i = 1; i < cdroms.length; i++) {
            addCdDrive();
            // Set the value for the newly added drive
            setTimeout(() => {
              const additionalDrives = cdContainer.querySelectorAll('select[name^="cdrom-"]');
              const lastDrive = additionalDrives[additionalDrives.length - 1];
              if (lastDrive) {
                lastDrive.value = cdroms[i];
                lastDrive.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, 100);
          }
        }, 100);
      })
    ]).then(() => {
      // Show edit modal after all data is loaded
      document.getElementById('edit-modal').classList.remove('hidden');
      document.getElementById('edit-modal').classList.add('flex');
    });
  })
  .catch(error => {
    console.error('Error loading instance:', error);
    alert(`Failed to load instance: ${error.message}`);
  });
}

function updateInstance() {
  const form = document.getElementById('edit-instance-form');
  const instanceId = form.dataset.instanceId;
  const formData = new FormData(form);

  // Convert memory from GB to MiB
  const memoryGB = parseFloat(formData.get('memoryGB')) || 2;
  const memoryMiB = Math.round(memoryGB * 1024);

  // Collect all CD drives
  const cdroms = [];
  const primaryCdrom = formData.get('cdrom');
  if (primaryCdrom) {
    cdroms.push(primaryCdrom);
  }

  // Add additional CD drives
  const cdContainer = document.getElementById('cd-drives-container');
  const additionalDrives = cdContainer.querySelectorAll('select[name^="cdrom-"]');
  additionalDrives.forEach(drive => {
    const value = drive.value;
    if (value) {
      cdroms.push(value);
    }
  });

  const updateData = {
    // Hardware
    cpuType: formData.get('processor') || 'host',
    memory: memoryMiB,
    bios: formData.get('bios') || 'seabios',
    graphics: formData.get('graphics') || 'virtio',
    machine: formData.get('machine') || 'pc',
    scsiController: formData.get('scsiController') || 'virtio-scsi-pci',
    cdroms: cdroms, // Use array instead of single cdrom
    diskSize: formData.get('diskSize') || '20',
    networkBridge: formData.get('networkBridge') || '',
    osType: formData.get('osType') || 'linux',

    // Cloud-Init
    username: formData.get('username') || '',
    password: formData.get('password') || '',
    domain: formData.get('domain') || '',
    dns1: formData.get('dns1') || '',
    dns2: formData.get('dns2') || '',
    ipAddressCIDR: formData.get('ipAddressCIDR') || '',
    gateway: formData.get('gateway') || '',
    sshKey: formData.get('sshKey') || '',
    bridge: formData.get('bridge') || '',
    vlanTag: formData.get('vlanTag') || '',
    networkModel: formData.get('networkModel') || 'virtio',
    networkConfig: formData.get('networkConfig') === 'on',
    diskResize: formData.get('diskResize') === 'on',
    addTpm: formData.get('addTpm') === 'on',

    // Options
    startBoot: formData.get('startBoot') === 'true',
    bootOrder: formData.get('bootOrder') || '',
    hotplug: formData.get('hotplug') === 'true',
    kvmVirtualization: formData.get('kvmVirtualization') === 'true'
  };

  fetch(`/api/instances/${instanceId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(updateData),
  })
  .then(response => response.json())
  .then(data => {
    if (data.message) {
      alert(`Instance updated successfully!`);
      closeEditModal();
      loadInstances();
      loadDashboard();
    } else {
      alert(`Error: ${data.error}`);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert(`Failed to update instance: ${error.message}`);
  });
}

function loadInstances() {
  // Prevent multiple simultaneous calls
  if (isLoadingInstances) {
    console.log('loadInstances already running, skipping');
    return;
  }
  isLoadingInstances = true;
  console.log('Starting loadInstances');

  // Show loading indicator
  const loadingIndicator = document.getElementById('loading-indicator');
  const noInstances = document.getElementById('no-instances');
  const tbody = document.getElementById('instances-tbody');

  if (loadingIndicator) loadingIndicator.classList.remove('hidden');
  if (noInstances) noInstances.classList.add('hidden');
  if (tbody) tbody.innerHTML = '';

  fetch('/api/instances', {
    credentials: 'include'
  })
  .then(response => response.json())
  .then(data => {
    console.log('Received instances data:', data.length, 'instances');

    // Hide loading indicator
    if (loadingIndicator) loadingIndicator.classList.add('hidden');

    if (data.length === 0) {
      if (noInstances) noInstances.classList.remove('hidden');
      isLoadingInstances = false;
      return;
    }

    // Check status for all instances
    const statusPromises = data.map(instance =>
      fetch(`/api/instances/${instance.id}/status`, {
        credentials: 'include'
      })
      .then(response => response.json())
      .catch(() => ({ isRunning: false, status: 'stopped' }))
    );

    Promise.all(statusPromises)
    .then(statuses => {
      console.log('Received status data for', statuses.length, 'instances');

      if (tbody) {
        // Clear tbody again just in case
        tbody.innerHTML = '';

        data.forEach((instance, index) => {
          const status = statuses[index];
          const isRunning = status.isRunning;
          const statusText = isRunning ? 'Running' : 'Stopped';
          const ipAddress = status.ipAddress || '-';

          // Create table row
          const row = document.createElement('tr');
          row.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50';

          row.innerHTML = `
            <td class="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
              ${instance.id}
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white">
              ${instance.name || instance.id}
            </td>
            <td class="px-4 py-4 whitespace-nowrap">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isRunning ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}">
                <span class="material-symbols-outlined text-xs mr-1">${isRunning ? 'check_circle' : 'error'}</span>
                ${statusText}
              </span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
              ${ipAddress}
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
              ${instance.host}
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm font-medium">
              <div class="flex items-center space-x-2">
                <button onclick="viewInstanceDetails('${instance.id}')" class="text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300 p-1 rounded" title="View Details">
                  <span class="material-symbols-outlined text-lg">visibility</span>
                </button>
                <button onclick="openConsole('${instance.id}')" class="text-primary hover:text-primary/80 p-1 rounded" title="Open Console">
                  <span class="material-symbols-outlined text-lg">desktop_windows</span>
                </button>
                <button onclick="editInstance('${instance.id}')" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 p-1 rounded" title="Edit Instance">
                  <span class="material-symbols-outlined text-lg">edit</span>
                </button>
                ${isRunning ?
                  `<button onclick="stopInstance('${instance.id}')" class="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300 p-1 rounded" title="Stop Instance">
                    <span class="material-symbols-outlined text-lg">stop</span>
                  </button>` :
                  `<button onclick="startInstance('${instance.id}')" class="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 p-1 rounded" title="Start Instance">
                    <span class="material-symbols-outlined text-lg">play_arrow</span>
                  </button>`
                }
                <button onclick="deleteInstance('${instance.id}')" class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-1 rounded" title="Delete Instance">
                  <span class="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </td>
          `;

          tbody.appendChild(row);
        });

        console.log('Added', data.length, 'rows to table');
      }

      isLoadingInstances = false;
    });
  })
  .catch(error => {
    console.error('Error loading instances:', error);
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-8 text-center text-red-600 dark:text-red-400">
            <span class="material-symbols-outlined text-4xl mb-2">error</span>
            <p>Failed to load instances</p>
          </td>
        </tr>
      `;
    }
    isLoadingInstances = false;
  });
}

function loadDashboard() {
  fetch('/api/instances')
  .then(response => response.json())
  .then(data => {
    document.getElementById('total-instances').textContent = data.length;

    // Check status for all instances to count running/stopped
    const statusPromises = data.map(instance =>
      fetch(`/api/instances/${instance.id}/status`)
      .then(response => response.json())
      .catch(() => ({ isRunning: false, status: 'stopped' }))
    );

    Promise.all(statusPromises)
    .then(statuses => {
      const runningCount = statuses.filter(status => status.isRunning).length;
      const stoppedCount = statuses.filter(status => !status.isRunning).length;

      document.getElementById('running-instances').textContent = runningCount;
      document.getElementById('stopped-instances').textContent = stoppedCount;
      // CPU usage is not implemented yet, set to 0%
      document.getElementById('cpu-usage').textContent = '0%';
    });
  });
}

function populateISOs() {
  fetch('/api/isos')
  .then(response => response.json())
  .then(data => {
    const select = document.getElementById('cdrom');
    select.innerHTML = '<option value="">None</option>';
    data.forEach(iso => {
      const option = document.createElement('option');
      option.value = `/var/lib/idve/isos/${iso}`;
      option.textContent = iso;
      select.appendChild(option);
    });
  });
}

function populateBridges() {
  fetch('/api/networks', {
    credentials: 'include'
  })
  .then(response => response.json())
  .then(data => {
    const select = document.getElementById('network-bridge');
    select.innerHTML = '<option value="">Select Bridge</option>';
    data.forEach(network => {
      if (network.type === 'bridge') {
        const option = document.createElement('option');
        option.value = network.name;
        option.textContent = `${network.name} (${network.ports || 'No interfaces'})`;
        select.appendChild(option);
      }
    });
  });
}

function populateEditBridges() {
  fetch('/api/networks')
  .then(response => response.json())
  .then(data => {
    const select = document.getElementById('edit-network-bridge');
    if (select) {
      select.innerHTML = '<option value="">Select Bridge</option>';
      data.filter(network => network.type === 'bridge').forEach(bridge => {
        const option = document.createElement('option');
        option.value = bridge.name;
        option.textContent = `${bridge.name} (${bridge.cidr || 'No IP'})`;
        select.appendChild(option);
      });
    }
  });
}

function populateCloudInitBridges() {
  fetch('/api/networks')
  .then(response => response.json())
  .then(data => {
    const select = document.getElementById('cloudinit-bridge');
    if (select) { 
      select.innerHTML = '<option value="">Select Bridge</option>';
      data.filter(network => network.type === 'bridge').forEach(bridge => {
        const option = document.createElement('option');
        option.value = bridge.name;
        option.textContent = `${bridge.name} (${bridge.cidr || 'No IP'})`;
        select.appendChild(option);
      });
    }
  });
}

function populateStoragePools() {
  fetch('/api/storages')
  .then(response => response.json())
  .then(data => {
    const select = document.getElementById('storage-pool');
    select.innerHTML = '<option value="">Select Storage Pool</option>';
    data.forEach(storage => {
      const option = document.createElement('option');
      option.value = storage.path;
      option.textContent = `${storage.name} (${storage.path})`;
      select.appendChild(option);
    });
  });
}

function viewInstanceDetails(instanceId) {
  window.location.href = `/vm-detail?id=${instanceId}`;
}

function openConsole(instanceId) {
  // Get VNC information for the instance
  fetch(`/api/instances/${instanceId}/vnc`)
  .then(response => response.json())
  .then(data => {
    // Open noVNC console in a new window - use WebSocket port for websockify connection
    const consoleUrl = `/novnc/vnc.html?host=${window.location.hostname}&port=${data.wsPort}&path=&autoconnect=true`;
    window.open(consoleUrl, `console-${instanceId}`, 'width=1024,height=768,scrollbars=no,resizable=yes');
  })
  .catch(error => {
    console.error('Error opening console:', error);
    alert(`Failed to open console for ${instanceId}: ${error.message}`);
  });
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
  loadInstances();
  loadDashboard();

  // Set up event listeners for form navigation
  document.getElementById('next-btn').addEventListener('click', nextStep);
  document.getElementById('prev-btn').addEventListener('click', prevStep);
  document.getElementById('create-btn').addEventListener('click', function() {
    document.getElementById('create-instance-form').dispatchEvent(new Event('submit'));
  });

  // Form submission handlers
  document.getElementById('create-instance-form').addEventListener('submit', function(e) {
    e.preventDefault();
    createInstance();
  });

  document.getElementById('edit-instance-form').addEventListener('submit', function(e) {
    e.preventDefault();
    updateInstance();
  });
});

// Helper functions for edit modal
function populateEditBridges() {
  return new Promise((resolve, reject) => {
    fetch('/api/networks')
    .then(response => response.json())
    .then(data => {
      const select = document.getElementById('edit-network-bridge');
      if (select) {
        select.innerHTML = '<option value="">Select Bridge</option>';
        data.filter(network => network.type === 'bridge').forEach(bridge => {
          const option = document.createElement('option');
          option.value = bridge.name;
          option.textContent = `${bridge.name} (${bridge.cidr || 'No IP'})`;
          select.appendChild(option);
        });
      }
      resolve();
    })
    .catch(error => {
      console.error('Error loading bridges:', error);
      resolve(); // Resolve even on error
    });
  });
}

function populateEditISOs() {
  return new Promise((resolve, reject) => {
    fetch('/api/isos')
    .then(response => response.json())
    .then(data => {
      const select = document.getElementById('edit-cdrom');
      if (select) {
        select.innerHTML = '<option value="">None</option>';
        data.forEach(iso => {
          const option = document.createElement('option');
          option.value = `/var/lib/idve/isos/${iso}`;
          option.textContent = iso;
          select.appendChild(option);
        });
      }
      resolve();
    })
    .catch(error => {
      console.error('Error loading ISOs:', error);
      resolve(); // Resolve even on error
    });
  });
}

function addCdDrive() {
  const container = document.getElementById('cd-drives-container');
  const driveCount = container.children.length + 1; // +1 because we already have the first drive

  // Create a new CD/DVD drive entry
  const driveDiv = document.createElement('div');
  driveDiv.className = 'flex items-center gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 clay-shadow';
  driveDiv.dataset.driveIndex = driveCount;

  driveDiv.innerHTML = `
    <div class="flex-1">
      <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">CD/DVD Drive ${driveCount + 1}</label>
      <select name="cdrom-${driveCount}" class="w-full rounded-lg bg-background-light dark:bg-background-dark border-2 border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-0 p-2 clay-shadow">
        <option value="">None</option>
        <!-- ISOs will be populated via JS -->
      </select>
    </div>
    <button type="button" onclick="removeCdDrive(this)" class="mt-6 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
      <span class="material-symbols-outlined">delete</span>
    </button>
  `;

  container.appendChild(driveDiv);

  // Populate the new select with ISOs
  populateDriveISOs(driveDiv.querySelector('select'));
}

function removeCdDrive(button) {
  const driveDiv = button.closest('[data-drive-index]');
  driveDiv.remove();

  // Renumber remaining drives
  const container = document.getElementById('cd-drives-container');
  Array.from(container.children).forEach((drive, index) => {
    const label = drive.querySelector('label');
    const select = drive.querySelector('select');
    if (label && select) {
      label.textContent = `CD/DVD Drive ${index + 2}`; // +2 because first drive is "CD/DVD Drive" (index 0)
      select.name = `cdrom-${index + 1}`; // +1 because first drive is "cdrom" (no suffix)
      drive.dataset.driveIndex = index + 1;
    }
  });
}

function populateDriveISOs(selectElement) {
  fetch('/api/isos')
  .then(response => response.json())
  .then(data => {
    selectElement.innerHTML = '<option value="">None</option>';
    data.forEach(iso => {
      const option = document.createElement('option');
      option.value = `/var/lib/idve/isos/${iso}`;
      option.textContent = iso;
      selectElement.appendChild(option);
    });
  })
  .catch(error => {
    console.error('Error loading ISOs:', error);
  });
}

function addHardDisk() {
  alert('Add Hard Disk functionality - to be implemented');
}

function addNetworkDevice() {
  alert('Add Network Device functionality - to be implemented');
}

// Cloud-Init Instance functions
function showCloudInitModal() {
  document.getElementById('cloudinit-modal').classList.remove('hidden');
  document.getElementById('cloudinit-modal').classList.add('flex');
  populateCloudInitTemplates();
  populateCloudInitBridges();
  populateCloudInitStoragePools();
}

function closeCloudInitModal() {
  document.getElementById('cloudinit-modal').classList.add('hidden');
  document.getElementById('cloudinit-modal').classList.remove('flex');
}

function populateCloudInitTemplates() {
  // Fetch available cloud-init templates from the server
  fetch('/api/cloudinit-templates', {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(templates => {
      const templateSelect = document.getElementById('cloudinit-template');
      // Clear existing options except the first one
      while (templateSelect.options.length > 1) {
        templateSelect.remove(1);
      }

      // Add templates from server
      templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        templateSelect.appendChild(option);
      });

      // Check URL parameters for template selection
      const urlParams = new URLSearchParams(window.location.search);
      const selectedTemplate = urlParams.get('template');
      if (selectedTemplate) {
        templateSelect.value = selectedTemplate;
        // Trigger change event to update form if needed
        templateSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })
    .catch(error => {
      console.error('Error loading cloud-init templates:', error);
      // Show error message instead of fallback options
      const templateSelect = document.getElementById('cloudinit-template');
      // Clear existing options except the first one
      while (templateSelect.options.length > 1) {
        templateSelect.remove(1);
      }
      // Add error option
      const errorOption = document.createElement('option');
      errorOption.value = '';
      errorOption.textContent = 'Error loading templates - please refresh';
      errorOption.disabled = true;
      templateSelect.appendChild(errorOption);
      
      showNotification('Failed to load CloudInit templates. Please refresh the page.', 'error');
    });
}

function populateCloudInitBridges() {
  return new Promise((resolve, reject) => {
    fetch('/api/networks', {
      credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
      // Populate Cloud-Init create modal bridge
      const createSelect = document.getElementById('cloudinit-bridge');
      if (createSelect) {
        createSelect.innerHTML = '<option value="virbr0">virbr0 (Default)</option>';
        data.forEach(network => {
          if (network.type === 'bridge') {
            const option = document.createElement('option');
            option.value = network.name;
            option.textContent = `${network.name} (${network.ports || 'No interfaces'})`;
            createSelect.appendChild(option);
          }
        });
      }

      // Populate Cloud-Init edit modal bridge
      const editSelect = document.getElementById('edit-cloudinit-bridge');
      if (editSelect) {
        editSelect.innerHTML = '<option value="">Select Bridge</option>';
        data.forEach(network => {
          if (network.type === 'bridge') {
            const option = document.createElement('option');
            option.value = network.name;
            option.textContent = `${network.name} (${network.ports || 'No interfaces'})`;
            editSelect.appendChild(option);
          }
        });
      }
      resolve();
    })
    .catch(error => {
      console.error('Error loading Cloud-Init bridges:', error);
      // Fallback to default options if API fails
      const createSelect = document.getElementById('cloudinit-bridge');
      if (createSelect) {
        createSelect.innerHTML = `
          <option value="virbr0">virbr0 (Default)</option>
          <option value="br0">br0</option>
          <option value="br1">br1</option>
        `;
      }
      const editSelect = document.getElementById('edit-cloudinit-bridge');
      if (editSelect) {
        editSelect.innerHTML = `
          <option value="">Select Bridge</option>
          <option value="virbr0">virbr0</option>
          <option value="br0">br0</option>
          <option value="br1">br1</option>
        `;
      }
      resolve(); // Resolve even on error
    });
  });
}

function populateCloudInitStoragePools() {
  fetch('/api/storages', {
    credentials: 'include'
  })
  .then(response => response.json())
  .then(data => {
    const select = document.getElementById('cloudinit-storage-pool');
    select.innerHTML = '<option value="">Select Storage Pool</option>';
    data.forEach(storage => {
      const option = document.createElement('option');
      option.value = storage.path;
      option.textContent = `${storage.name} (${storage.type})`;
      select.appendChild(option);
    });
  })
  .catch(error => {
    console.error('Error loading storage pools:', error);
    // Fallback to default local storage
    const select = document.getElementById('cloudinit-storage-pool');
    select.innerHTML = '<option value="/var/lib/idve/instances">Local Storage (Default)</option>';
  });
}

function createCloudInitInstance() {
  const form = document.getElementById('cloudinit-form');
  const formData = new FormData(form);

  // Validate required fields
  const templateId = formData.get('template');
  const instanceName = formData.get('instanceName');
  const username = formData.get('username');
  const password = formData.get('password');

  if (!templateId) {
    showNotification('Please select a CloudInit template', 'error');
    return;
  }
  if (!instanceName) {
    showNotification('Instance name is required', 'error');
    return;
  }
  if (!username) {
    showNotification('Username is required', 'error');
    return;
  }
  if (!password) {
    showNotification('Password is required', 'error');
    return;
  }

  const instanceData = {
    templateId: templateId,
    instanceName: instanceName,
    sshKey: formData.get('sshKey'),
    networkConfig: formData.get('networkConfig') === 'on',
    diskResize: formData.get('diskResize') === 'on',
    diskSize: formData.get('diskSize'),
    addTpm: formData.get('addTpm') === 'on',
    storagePool: formData.get('storagePool'),
    // Network Configuration
    bridge: formData.get('bridge'),
    vlanTag: formData.get('vlanTag'),
    networkModel: formData.get('networkModel'),
    // User Configuration
    username: username,
    password: password,
    // Domain & DNS
    domain: formData.get('domain'),
    dns1: formData.get('dns1'),
    dns2: formData.get('dns2'),
    // IP Configuration - use CIDR format if provided, otherwise use custom IP
    ipAddressCIDR: formData.get('ipAddress') || formData.get('customIpAddress'),
    gateway: formData.get('gateway')
  };

  // Show loading state
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin mr-2">refresh</span>Creating...';
  submitBtn.disabled = true;

  fetch('/api/instances/cloudinit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(instanceData)
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(err => {
        throw new Error(err.error || 'Server error');
      });
    }
    return response.json();
  })
  .then(data => {
    if (data.success) {
      closeCloudInitModal();
      loadInstances(); // Refresh the instances list
      showNotification('Cloud-Init instance created successfully!', 'success');
    } else {
      throw new Error(data.message || 'Failed to create Cloud-Init instance');
    }
  })
  .catch(error => {
    console.error('Error creating Cloud-Init instance:', error);
    showNotification('Failed to create Cloud-Init instance: ' + error.message, 'error');
  })
  .finally(() => {
    // Restore button state
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  });
}

// Notification function
function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll('.notification');
  existingNotifications.forEach(notification => notification.remove());

  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg clay-shadow max-w-sm ${
    type === 'success' ? 'bg-green-500 text-white' :
    type === 'error' ? 'bg-red-500 text-white' :
    'bg-blue-500 text-white'
  }`;
  notification.innerHTML = `
    <div class="flex items-center">
      <span class="material-symbols-outlined mr-2">${
        type === 'success' ? 'check_circle' :
        type === 'error' ? 'error' :
        'info'
      }</span>
      <span>${message}</span>
    </div>
  `;

  // Add to page
  document.body.appendChild(notification);

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 5000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Edit form submission
  const editForm = document.getElementById('edit-instance-form');
  if (editForm) {
    editForm.addEventListener('submit', function(e) {
      e.preventDefault();
      updateInstance();
    });
  }

  // Cloud-Init form submission
  const cloudInitForm = document.getElementById('cloudinit-form');
  if (cloudInitForm) {
    cloudInitForm.addEventListener('submit', function(e) {
      e.preventDefault();
      createCloudInitInstance();
    });
  }

  // Load initial data only once
  loadInstances();
  loadDashboard();
  
  // Setup OS type listener for form defaults
  setupOSTypeListener();
});