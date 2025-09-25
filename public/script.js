const socket = io();

function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(sectionId).classList.add('active');
  
  // Update navigation active state
  document.querySelectorAll('nav a').forEach(link => {
    link.classList.remove('text-primary', 'font-semibold');
    link.classList.add('text-slate-700', 'dark:text-slate-300');
  });
  const activeLink = document.querySelector(`nav a[onclick*="${sectionId}"]`);
  if (activeLink) {
    activeLink.classList.add('text-primary', 'font-semibold');
    activeLink.classList.remove('text-slate-700', 'dark:text-slate-300');
  }
}

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

function showEditModal() {
  document.getElementById('edit-modal').classList.remove('hidden');
  document.getElementById('edit-modal').classList.add('flex');
  populateEditBridges();
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
  document.getElementById('edit-modal').classList.remove('flex');
}

let currentStep = 0;
const totalSteps = 7;

function showStep(step) {
  document.querySelectorAll('.step').forEach((el, index) => {
    el.classList.toggle('active', index === step);
    el.classList.toggle('hidden', index !== step);
  });
  
  document.getElementById('progress-bar').style.width = ((step + 1) / (totalSteps + 1)) * 100 + '%';
  
  document.getElementById('prev-btn').disabled = step === 0;
  document.getElementById('next-btn').classList.toggle('hidden', step === totalSteps);
  document.getElementById('create-btn').classList.toggle('hidden', step !== totalSteps);
  
  if (step === totalSteps) {
    generateSummary();
  }
}

function nextStep() {
  if (currentStep < totalSteps) {
    currentStep++;
    showStep(currentStep);
  }
}

function prevStep() {
  if (currentStep > 0) {
    currentStep--;
    showStep(currentStep);
  }
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

function generateSummary() {
  const formData = new FormData(document.getElementById('create-instance-form'));
  const data = Object.fromEntries(formData);
  
  const summary = [
    { key: 'Host/Node', value: data.host },
    { key: 'Instance ID', value: data.instanceId },
    { key: 'Name', value: data.name },
    { key: 'OS Type', value: data.osType },
    { key: 'CDROM', value: data.cdrom || 'None' },
    { key: 'Graphics', value: data.graphics },
    { key: 'Machine', value: data.machine },
    { key: 'BIOS', value: data.bios },
    { key: 'SCSI Controller', value: data.scsiController },
    { key: 'Add TPM', value: data.addTpm ? 'Yes' : 'No' },
    { key: 'QEMU Agent', value: data.qemuAgent ? 'Yes' : 'No' },
    { key: 'Disk Bus', value: data.diskBus },
    { key: 'Disk SCSI Controller', value: data.diskScsiController },
    { key: 'Storage Pool', value: data.storagePool },
    { key: 'Disk Size', value: data.diskSize + ' GiB' },
    { key: 'CPU Sockets', value: data.cpuSockets },
    { key: 'CPU Cores', value: data.cpuCores },
    { key: 'CPU Type', value: data.cpuType },
    { key: 'Memory', value: data.memory + ' MiB' },
    { key: 'Balloon Device', value: data.balloonDevice ? 'Yes' : 'No' },
    { key: 'Network Bridge', value: data.networkBridge },
    { key: 'VLAN Tag', value: data.vlanTag || 'None' },
    { key: 'Network Model', value: data.networkModel },
    { key: 'MAC Address', value: data.macAddress || 'Auto' },
    { key: 'Start After Create', value: data.startAfterCreate ? 'Yes' : 'No' }
  ];
  
  const tbody = document.getElementById('config-summary');
  tbody.innerHTML = '';
  summary.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="py-1 font-medium">${item.key}</td>
      <td class="py-1">${item.value}</td>
    `;
    tbody.appendChild(row);
  });
}

document.getElementById('next-btn').addEventListener('click', nextStep);
document.getElementById('prev-btn').addEventListener('click', prevStep);
document.getElementById('create-btn').addEventListener('click', function() {
  document.getElementById('create-instance-form').dispatchEvent(new Event('submit'));
});

document.getElementById('create-instance-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  const data = Object.fromEntries(formData);
  const instanceId = this.dataset.instanceId;
  
  const method = instanceId ? 'PUT' : 'POST';
  const url = instanceId ? `/api/instances/${instanceId}` : '/api/instances';
  
  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(data => {
    const action = instanceId ? 'updated' : 'created';
    alert(`Instance ${action} successfully!`);
    
    // Reset form and modal state
    this.reset();
    delete this.dataset.instanceId;
    document.getElementById('create-btn').textContent = 'Create Instance';
    
    closeModal();
    loadInstances();
    loadDashboard();
  })
  .catch(error => console.error('Error:', error));
});

document.getElementById('edit-instance-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  const data = Object.fromEntries(formData);
  const instanceId = this.dataset.instanceId;
  
  fetch(`/api/instances/${instanceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(data => {
    alert('Instance updated successfully!');
    
    // Reset form and close modal
    this.reset();
    delete this.dataset.instanceId;
    
    closeEditModal();
    loadInstances();
    loadDashboard();
  })
  .catch(error => console.error('Error:', error));
});

function loadInstances() {
  fetch('/api/instances')
  .then(response => response.json())
  .then(data => {
    const list = document.getElementById('instances-list');
    list.innerHTML = '';
    
    // Check status for all instances
    const statusPromises = data.map(instance => 
      fetch(`/api/instances/${instance.id}/status`)
      .then(response => response.json())
      .catch(() => ({ isRunning: false, status: 'stopped' })) // Default to stopped if status check fails
    );
    
    Promise.all(statusPromises)
    .then(statuses => {
      data.forEach((instance, index) => {
        const status = statuses[index];
        const isRunning = status.isRunning;
        
        const card = document.createElement('div');
        card.className = 'rounded-xl bg-background-light dark:bg-background-dark clay-shadow p-6';
        card.innerHTML = `
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-slate-900 dark:text-white">${instance.name || instance.id}</h3>
            <span class="material-symbols-outlined ${isRunning ? 'text-green-500' : 'text-red-500'}">${isRunning ? 'check_circle' : 'error'}</span>
          </div>
          <div class="space-y-2 text-sm text-slate-500 dark:text-slate-400">
            <p>Host: ${instance.host}</p>
            <p>Memory: ${instance.memory} MiB</p>
            <p>CPU: ${instance.cpuSockets} socket(s), ${instance.cpuCores} core(s)</p>
            <p>Status: ${isRunning ? 'Running' : 'Stopped'}</p>
          </div>
          <div class="mt-4 flex gap-2">
            <button onclick="openConsole('${instance.id}')" class="rounded-lg bg-primary px-3 py-2 font-semibold text-white transition hover:bg-primary/90">Console</button>
            <button onclick="editInstance('${instance.id}')" class="rounded-lg bg-blue-500 px-3 py-2 font-semibold text-white transition hover:bg-blue-600">Edit</button>
            ${isRunning ?
              `<button onclick="stopInstance('${instance.id}')" class="rounded-lg bg-yellow-500 px-3 py-2 font-semibold text-white transition hover:bg-yellow-600">Stop</button>` :
              `<button onclick="startInstance('${instance.id}')" class="rounded-lg bg-green-500 px-3 py-2 font-semibold text-white transition hover:bg-green-600">Start</button>`
            }
            <button onclick="deleteInstance('${instance.id}')" class="rounded-lg bg-red-500 px-3 py-2 font-semibold text-white transition hover:bg-red-600">Delete</button>
          </div>
        `;
        list.appendChild(card);
      });
    });
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
      document.getElementById('error-instances').textContent = 0; // For now, no error tracking
      
      const recentList = document.getElementById('recent-instances');
      recentList.innerHTML = '';
      data.slice(0, 5).forEach((instance, index) => {
        const status = statuses[index];
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-4 rounded-lg bg-slate-100 dark:bg-slate-800/50';
        item.innerHTML = `
          <div class="flex items-center gap-4">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <span class="material-symbols-outlined">dns</span>
            </div>
            <div>
              <p class="font-semibold text-slate-900 dark:text-white">${instance.name || instance.id}</p>
              <p class="text-sm text-slate-500 dark:text-slate-400">${status.isRunning ? 'Running' : 'Stopped'}</p>
            </div>
          </div>
          <span class="material-symbols-outlined text-slate-500">more_vert</span>
        `;
        recentList.appendChild(item);
      });
    });
  });
}

function loadImages() {
  fetch('/api/images')
  .then(response => response.json())
  .then(data => {
    const list = document.getElementById('templates-list');
    list.innerHTML = '';
    data.forEach(image => {
      const card = document.createElement('div');
      card.className = 'rounded-xl bg-background-light dark:bg-background-dark clay-shadow p-6';
      card.innerHTML = `
        <div class="flex items-center gap-4 mb-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <span class="material-symbols-outlined">image</span>
          </div>
          <div>
            <p class="font-semibold text-slate-900 dark:text-white">${image}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400">CloudInit Template</p>
          </div>
        </div>
        <button onclick="selectImage('${image}', 'cloudinit')" class="w-full rounded-lg bg-primary py-2 font-semibold text-white transition hover:bg-primary/90">Use Template</button>
      `;
      list.appendChild(card);
    });
  });
}

function loadIsos() {
  fetch('/api/isos')
  .then(response => response.json())
  .then(data => {
    const list = document.getElementById('isos-list');
    list.innerHTML = '';
    data.forEach(iso => {
      const card = document.createElement('div');
      card.className = 'rounded-xl bg-background-light dark:bg-background-dark clay-shadow p-6';
      card.innerHTML = `
        <div class="flex items-center gap-4 mb-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-500/20 text-yellow-500">
            <span class="material-symbols-outlined">disc_full</span>
          </div>
          <div>
            <p class="font-semibold text-slate-900 dark:text-white">${iso}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400">Custom ISO</p>
          </div>
        </div>
        <button onclick="selectImage('${iso}', 'iso')" class="w-full rounded-lg bg-primary py-2 font-semibold text-white transition hover:bg-primary/90">Use ISO</button>
      `;
      list.appendChild(card);
    });
  });
}

function selectImage(path, type) {
  document.getElementById('iso').value = path;
  document.getElementById('type').value = type;
  showCreateInstanceModal();
}

// Instance management functions
function openConsole(instanceId) {
  // For now, just alert. In real implementation, would open terminal/console
  alert(`Opening console for ${instanceId}`);
}

function editInstance(instanceId) {
  fetch(`/api/instances/${instanceId}`)
  .then(response => response.json())
  .then(data => {
    // Mapping between JSON properties and HTML element IDs
    const fieldMapping = {
      instanceId: 'edit-instance-id',
      name: 'edit-name',
      host: 'edit-host',
      memory: 'edit-memory',
      cpuSockets: 'edit-cpu-sockets',
      cpuCores: 'edit-cpu-cores',
      networkBridge: 'edit-network-bridge',
      macAddress: 'edit-mac-address'
    };
    
    // Populate form with existing data
    Object.keys(data).forEach(key => {
      const elementId = fieldMapping[key];
      if (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
          element.value = data[key];
        }
      }
    });
    
    // Store the instance ID for update operation
    document.getElementById('edit-instance-form').dataset.instanceId = instanceId;
    
    // Show edit modal
    showEditModal();
  })
  .catch(error => console.error('Error loading instance:', error));
}

function stopInstance(instanceId) {
  if (confirm(`Are you sure you want to stop instance ${instanceId}?`)) {
    fetch(`/api/instances/${instanceId}/stop`, {
      method: 'PUT'
    })
    .then(response => response.json())
    .then(data => {
      alert('Instance stopped successfully!');
      loadInstances();
      loadDashboard();
    })
    .catch(error => console.error('Error:', error));
  }
}

function startInstance(instanceId) {
  fetch(`/api/instances/${instanceId}/start`, {
    method: 'PUT'
  })
  .then(response => response.json())
  .then(data => {
    alert('Instance started successfully!');
    loadInstances();
    loadDashboard();
  })
  .catch(error => console.error('Error:', error));
}

function deleteInstance(instanceId) {
  if (confirm(`Are you sure you want to delete instance ${instanceId}? This action cannot be undone.`)) {
    fetch(`/api/instances/${instanceId}`, {
      method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
      alert('Instance deleted successfully!');
      loadInstances();
      loadDashboard();
    })
    .catch(error => console.error('Error:', error));
  }
}

// Load initial data
loadInstances();
loadDashboard();

// Check URL params for image selection
const urlParams = new URLSearchParams(window.location.search);
const image = urlParams.get('image');
const type = urlParams.get('type');
if (image && type) {
  document.getElementById('iso').value = image;
  document.getElementById('type').value = type;
  showCreateInstanceModal();
  // Clear URL
  window.history.replaceState({}, document.title, "/");
}