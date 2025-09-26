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

function loadInstances() {
  fetch('/api/instances')
  .then(response => response.json())
  .then(data => {
    // const list = document.getElementById('instances-list');
    // list.innerHTML = '';
    
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
        // list.appendChild(card);
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

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', function() {
  // Initialize resource monitoring charts
  initResourceCharts();
  initNetworkTrafficChart();
  updateResourceCharts();
  updateNetworkTrafficChart();
  
  // Update resource data every 30 seconds
  setInterval(updateResourceCharts, 30000);
  
  // Update network traffic data every 5 seconds
  setInterval(updateNetworkTrafficChart, 5000);
  
  // Load initial dashboard data
  loadDashboard();
});

// Host Resource Monitoring
let cpuChart, memoryChart, storageChart, networkTrafficChart;
let networkTrafficData = { rx: [], tx: [], timestamps: [] };
let selectedInterface = 'all';
let timeRange = '1h';

function initResourceCharts() {
  const chartOptions = {
    plugins: {
      legend: {
        display: false
      }
    },
    responsive: true,
    maintainAspectRatio: false
  };

  // CPU Chart
  const cpuCtx = document.getElementById('cpuChart').getContext('2d');
  cpuChart = new Chart(cpuCtx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [0, 100],
        backgroundColor: ['#137fec', '#e5e7eb'],
        borderWidth: 0,
        cutout: '70%'
      }]
    },
    options: chartOptions
  });

  // Memory Chart
  const memoryCtx = document.getElementById('memoryChart').getContext('2d');
  memoryChart = new Chart(memoryCtx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [0, 100],
        backgroundColor: ['#10b981', '#e5e7eb'],
        borderWidth: 0,
        cutout: '70%'
      }]
    },
    options: chartOptions
  });

  // Storage Chart
  const storageCtx = document.getElementById('storageChart').getContext('2d');
  storageChart = new Chart(storageCtx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [0, 100],
        backgroundColor: ['#f59e0b', '#e5e7eb'],
        borderWidth: 0,
        cutout: '70%'
      }]
    },
    options: chartOptions
  });
}

function updateResourceCharts() {
  fetch('/api/host-resources')
    .then(response => response.json())
    .then(data => {
      // Helper function to format bytes
      function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
      }

      // Update CPU Chart
      const cpuUsed = Math.round(data.cpu.used);
      const cpuFree = 100 - cpuUsed;
      cpuChart.data.datasets[0].data = [cpuUsed, cpuFree];
      cpuChart.update();
      document.getElementById('cpu-percentage').textContent = `${cpuUsed}%`;
      document.getElementById('cpu-details').textContent = `${cpuUsed}% / 100%`;

      // Update Memory Chart
      const memoryUsedPercent = data.memory.total > 0 ? Math.round((data.memory.used / data.memory.total) * 100) : 0;
      const memoryFreePercent = 100 - memoryUsedPercent;
      memoryChart.data.datasets[0].data = [memoryUsedPercent, memoryFreePercent];
      memoryChart.update();
      document.getElementById('memory-percentage').textContent = `${memoryUsedPercent}%`;
      document.getElementById('memory-details').textContent = `${data.memory.used} MB / ${data.memory.total} MB`;

      // Update Storage Chart
      const storageUsedPercent = data.storage.total > 0 ? Math.round((data.storage.used / data.storage.total) * 100) : 0;
      const storageFreePercent = 100 - storageUsedPercent;
      storageChart.data.datasets[0].data = [storageUsedPercent, storageFreePercent];
      storageChart.update();
      document.getElementById('storage-percentage').textContent = `${storageUsedPercent}%`;
      document.getElementById('storage-details').textContent = `${formatBytes(data.storage.used * 1024)} / ${formatBytes(data.storage.total * 1024)}`;
    })
    .catch(error => {
      console.error('Error fetching host resources:', error);
    });
}

// Network Traffic Monitoring
function initNetworkTrafficChart() {
  const ctx = document.getElementById('networkTrafficChart').getContext('2d');
  
  networkTrafficChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Receive (RX)',
        data: [],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4
      }, {
        label: 'Transmit (TX)',
        data: [],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x'
          },
          zoom: {
            wheel: {
              enabled: true
            },
            pinch: {
              enabled: true
            },
            mode: 'x'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed.y;
              return context.dataset.label + ': ' + formatNetworkSpeed(value);
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            displayFormats: {
              minute: 'HH:mm',
              hour: 'HH:mm'
            }
          },
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          },
          ticks: {
            callback: function(value) {
              return formatNetworkSpeed(value);
            }
          }
        }
      }
    }
  });
}

function updateNetworkTrafficChart() {
  fetch('/api/network-traffic')
    .then(response => response.json())
    .then(data => {
      // Update interface selector
      updateInterfaceSelector(data.interfaces);
      
      // Get data for selected interface
      let rxData = [];
      let txData = [];
      let timestamps = [];
      
      if (selectedInterface === 'all') {
        // Use totals for all interfaces
        rxData = data.history[selectedInterface]?.map(point => point.rxRate) || [];
        txData = data.history[selectedInterface]?.map(point => point.txRate) || [];
        timestamps = data.history[selectedInterface]?.map(point => point.timestamp) || [];
      } else if (data.history[selectedInterface]) {
        rxData = data.history[selectedInterface].map(point => point.rxRate);
        txData = data.history[selectedInterface].map(point => point.txRate);
        timestamps = data.history[selectedInterface].map(point => point.timestamp);
      }
      
      // Filter data based on time range
      const now = new Date();
      const timeRangeMs = getTimeRangeMs(timeRange);
      const cutoffTime = new Date(now.getTime() - timeRangeMs);
      
      const filteredData = timestamps
        .map((timestamp, index) => ({
          timestamp: new Date(timestamp),
          rx: rxData[index] || 0,
          tx: txData[index] || 0
        }))
        .filter(point => point.timestamp >= cutoffTime);
      
      // Update chart data
      networkTrafficChart.data.labels = filteredData.map(point => point.timestamp);
      networkTrafficChart.data.datasets[0].data = filteredData.map(point => point.rx);
      networkTrafficChart.data.datasets[1].data = filteredData.map(point => point.tx);
      networkTrafficChart.update();
      
      // Update current stats
      const currentRx = data.totals?.rxRate || 0;
      const currentTx = data.totals?.txRate || 0;
      document.getElementById('network-stats').textContent = 
        `RX: ${formatNetworkSpeed(currentRx)} | TX: ${formatNetworkSpeed(currentTx)}`;
    })
    .catch(error => {
      console.error('Error fetching network traffic:', error);
    });
}

function updateInterfaceSelector(interfaces) {
  const select = document.getElementById('network-interface-select');
  const currentValue = select.value;
  
  // Clear existing options except "All Interfaces"
  select.innerHTML = '<option value="all">All Interfaces</option>';
  
  // Add interface options
  Object.keys(interfaces).forEach(interfaceName => {
    const option = document.createElement('option');
    option.value = interfaceName;
    option.textContent = interfaceName;
    select.appendChild(option);
  });
  
  // Restore selected value if it still exists
  if (currentValue && (currentValue === 'all' || interfaces[currentValue])) {
    select.value = currentValue;
  } else {
    selectedInterface = 'all';
  }
}

function formatNetworkSpeed(bytesPerSecond) {
  if (bytesPerSecond === 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const k = 1024;
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

function getTimeRangeMs(range) {
  const ranges = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000
  };
  return ranges[range] || ranges['1h'];
}

// Event listeners for network traffic controls
document.getElementById('network-interface-select')?.addEventListener('change', function(e) {
  selectedInterface = e.target.value;
  updateNetworkTrafficChart();
});

document.getElementById('time-range-select')?.addEventListener('change', function(e) {
  timeRange = e.target.value;
  updateNetworkTrafficChart();
});

document.getElementById('reset-zoom-btn')?.addEventListener('click', function() {
  networkTrafficChart.resetZoom();
});