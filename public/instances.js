// Instances management functions
const socket = io();
let currentStep = 0;
const totalSteps = 8;
let isLoadingInstances = false;

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
    { key: 'MAC Address', value: formData.get('macAddress') || 'Auto' },
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
    macAddress: formData.get('macAddress'),
    startAfterCreate: formData.get('startAfterCreate') === 'on'
  };

  fetch('/api/instances', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
  })
  .then(response => response.json())
  .then(data => {
    if (data.message) {
      alert(`Instance started successfully!`);
      loadInstances();
      loadDashboard();
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
  })
  .then(response => response.json())
  .then(data => {
    if (data.message) {
      alert(`Instance stopped successfully!`);
      loadInstances();
      loadDashboard();
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
    fetch(`/api/instances/${instanceId}`, {
      method: 'DELETE',
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
  fetch(`/api/instances/${instanceId}`)
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
    setFieldValue('edit-disk-size', data.diskSize || '20');
    setFieldValue('edit-os-type', data.osType || 'linux');

    // Cloud-Init fields (these might not exist in current API, so set defaults)
    setFieldValue('edit-user', data.user || '');
    setFieldValue('edit-password', data.password || '');
    setFieldValue('edit-dns-domain', data.dnsDomain || '');
    setFieldValue('edit-dns-server', data.dnsServer || '');
    setFieldValue('edit-ssh-key', data.sshKey || '');
    setFieldValue('edit-upgrade-package', data.upgradePackage || '');
    setFieldValue('edit-additional-package', data.additionalPackage || '');
    setFieldValue('edit-ip-config', data.ipConfig || '');

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
    user: formData.get('user') || '',
    password: formData.get('password') || '',
    dnsDomain: formData.get('dnsDomain') || '',
    dnsServer: formData.get('dnsServer') || '',
    sshKey: formData.get('sshKey') || '',
    upgradePackage: formData.get('upgradePackage') || '',
    additionalPackage: formData.get('additionalPackage') || '',
    ipConfig: formData.get('ipConfig') || '',

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

  fetch('/api/instances')
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
      fetch(`/api/instances/${instance.id}/status`)
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
              - <!-- IP Address not available in current API -->
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
  fetch('/api/networks')
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
  window.location.href = `/vm-detail.html?id=${instanceId}`;
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
  return fetch('/api/networks')
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
  })
  .catch(error => {
    console.error('Error loading bridges:', error);
  });
}

function populateEditISOs() {
  return fetch('/api/isos')
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
  })
  .catch(error => {
    console.error('Error loading ISOs:', error);
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

  // Load initial data only once
  loadInstances();
  loadDashboard();
});