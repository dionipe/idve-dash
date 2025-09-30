const socket = io();

// Authentication functions
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth-status');
    const data = await response.json();
    return data.authenticated;
  } catch (error) {
    console.error('Error checking auth status:', error);
    return false;
  }
}

function showLoginModal() {
  // Create login modal if it doesn't exist
  if (!document.getElementById('login-modal')) {
    const modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
        <h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-4">Login to Dashboard</h2>
        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Username</label>
            <input type="text" id="username" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm focus:border-primary focus:ring-primary" required>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password</label>
            <input type="password" id="password" class="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm focus:border-primary focus:ring-primary" required>
          </div>
          <div id="login-error" class="text-red-500 text-sm hidden"></div>
          <button type="submit" id="login-btn" class="w-full bg-primary text-white py-2 px-4 rounded-lg hover:bg-primary/90 transition">
            <span class="inline-block mr-2">Login</span>
            <span class="material-symbols-outlined text-sm">login</span>
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('login-modal').classList.add('flex');
}

function hideLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');

  // Show loading state
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="inline-block mr-2">Logging in...</span><span class="material-symbols-outlined text-sm animate-spin">refresh</span>';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (data.success) {
      hideLoginModal();
      // Reload the page to initialize
      window.location.reload();
    } else {
      loginError.textContent = data.message || 'Login failed';
      loginError.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Login error:', error);
    loginError.textContent = 'Network error. Please try again.';
    loginError.classList.remove('hidden');
  } finally {
    // Reset button state
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<span class="inline-block mr-2">Login</span><span class="material-symbols-outlined text-sm">login</span>';
  }
}

// Initialize authentication on page load
document.addEventListener('DOMContentLoaded', async function() {
  const isAuthenticated = await checkAuthStatus();

  if (!isAuthenticated) {
    showLoginModal();
  } else {
    // Initialize with networks tab active
    switchTab('networks');
  }

  // Setup login form
  document.addEventListener('submit', function(e) {
    if (e.target.id === 'login-form') {
      handleLogin(e);
    }
  });
});

// Tab switching functionality
function switchTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });

  // Remove active class from all tab buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });

  // Show selected tab content
  document.getElementById(tabName + '-content').classList.remove('hidden');

  // Add active class to selected tab button
  document.getElementById(tabName + '-tab').classList.add('active');

  // Update button visibility
  const createNetworkBtn = document.getElementById('create-network-btn');
  const createIPPoolBtn = document.getElementById('create-ip-pool-btn');

  if (tabName === 'networks') {
    createNetworkBtn.classList.remove('hidden');
    createIPPoolBtn.classList.add('hidden');
    loadNetworks();
  } else if (tabName === 'ip-pools') {
    createNetworkBtn.classList.add('hidden');
    createIPPoolBtn.classList.remove('hidden');
    loadIPPools();
  }
}

// IP Pool Management Functions
function loadIPPools() {
  const loadingDiv = document.getElementById('ip-pools-loading');
  const noPoolsDiv = document.getElementById('no-ip-pools');
  const tableBody = document.getElementById('ip-pools-table-body');

  loadingDiv.classList.remove('hidden');
  noPoolsDiv.classList.add('hidden');
  tableBody.innerHTML = '';

  fetch('/api/ip-pools', {
    credentials: 'include'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to load IP pools');
    }
    return response.json();
  })
  .then(pools => {
    loadingDiv.classList.add('hidden');

    if (pools.length === 0) {
      noPoolsDiv.classList.remove('hidden');
      updateIPPoolStats(0, 0, 0);
      return;
    }

    let totalIPs = 0;
    let availableIPs = 0;

    pools.forEach(pool => {
      const totalPoolIPs = pool.availableIPs.length + Object.keys(pool.assignedIPs).length;
      const availablePoolIPs = pool.availableIPs.length;
      const assignedPoolIPs = Object.keys(pool.assignedIPs).length;
      const utilizationPercent = totalPoolIPs > 0 ? Math.round((assignedPoolIPs / totalPoolIPs) * 100) : 0;

      totalIPs += totalPoolIPs;
      availableIPs += availablePoolIPs;

      const row = document.createElement('tr');
      row.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50';
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">${pool.name}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${pool.network}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${pool.interface || 'Not set'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${pool.gateway}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${totalPoolIPs}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400">${availablePoolIPs}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600 dark:text-blue-400">${assignedPoolIPs}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
          <div class="flex items-center">
            <div class="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-2 mr-2">
              <div class="h-2 rounded-full" style="width: ${utilizationPercent}%; background-color: ${
                utilizationPercent > 80 ? '#ef4444' : 
                utilizationPercent > 60 ? '#f59e0b' : 
                '#10b981'
              }"></div>
            </div>
            <span class="text-xs">${utilizationPercent}%</span>
          </div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
          <button onclick="editIPPool('${pool.id}')" class="text-primary hover:text-primary/80 mr-2">Edit</button>
          <button onclick="deleteIPPool('${pool.id}', '${pool.name}')" class="text-red-500 hover:text-red-400">Delete</button>
        </td>
      `;
      tableBody.appendChild(row);
    });

    updateIPPoolStats(pools.length, totalIPs, availableIPs);
  })
  .catch(error => {
    console.error('Error loading IP pools:', error);
    loadingDiv.classList.add('hidden');
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="px-6 py-4 text-center text-red-500">
          <span class="material-symbols-outlined mr-2">error</span>
          Failed to load IP pools
        </td>
      </tr>
    `;
  });
}

function updateIPPoolStats(totalPools, totalIPs, availableIPs) {
  document.getElementById('total-ip-pools').textContent = totalPools;
  document.getElementById('total-ip-addresses').textContent = totalIPs;
  document.getElementById('available-ip-addresses').textContent = availableIPs;
}

function showCreateIPPoolModal() {
  document.getElementById('ip-pool-modal').classList.remove('hidden');
  document.getElementById('ip-pool-modal').classList.add('flex');
  document.getElementById('create-ip-pool-form').reset();
  document.getElementById('ip-pool-modal-title').textContent = 'Create IP Pool';
  document.getElementById('ip-pool-submit-btn').innerHTML = '<span class="material-symbols-outlined mr-2">group_work</span>Create IP Pool';
  document.getElementById('ip-pool-info').textContent = 'Enter network details above to see pool information';

  // Remove editing state
  delete document.getElementById('ip-pool-modal').dataset.editing;

  // Enable name field
  document.getElementById('ip-pool-name').disabled = false;

  // Populate network interfaces
  populateNetworkInterfaces();

  // Add input listeners for real-time validation
  setupIPPoolValidation();
}

function populateNetworkInterfaces() {
  fetch('/api/networks', {
    credentials: 'include'
  })
  .then(response => response.json())
  .then(data => {
    const select = document.getElementById('ip-pool-interface');
    select.innerHTML = '<option value="">Select Network Interface</option>';
    
    data.forEach(network => {
      const option = document.createElement('option');
      option.value = network.name;
      option.textContent = `${network.name} (${network.cidr || 'No IP'})`;
      select.appendChild(option);
    });
  })
  .catch(error => {
    console.error('Error loading network interfaces:', error);
  });
}

function closeIPPoolModal() {
  document.getElementById('ip-pool-modal').classList.add('hidden');
  document.getElementById('ip-pool-modal').classList.remove('flex');
  document.getElementById('create-ip-pool-form').reset();

  // Remove editing state
  delete document.getElementById('ip-pool-modal').dataset.editing;
}

function setupIPPoolValidation() {
  const networkInput = document.getElementById('ip-pool-network');
  const startIPInput = document.getElementById('ip-pool-start-ip');
  const endIPInput = document.getElementById('ip-pool-end-ip');
  const infoDiv = document.getElementById('ip-pool-info');

  function updateInfo() {
    const network = networkInput.value;
    const startIP = startIPInput.value;
    const endIP = endIPInput.value;

    if (!network || !startIP || !endIP) {
      infoDiv.textContent = 'Enter network details above to see pool information';
      return;
    }

    try {
      // Basic validation
      const networkParts = network.split('/');
      if (networkParts.length !== 2) {
        infoDiv.textContent = 'Invalid network format. Use CIDR notation (e.g., 192.168.1.0/24)';
        return;
      }

      const subnet = parseInt(networkParts[1]);
      if (subnet < 8 || subnet > 30) {
        infoDiv.textContent = 'Subnet must be between /8 and /30';
        return;
      }

      // Calculate IP range
      const totalIPs = Math.pow(2, 32 - subnet) - 2; // Subtract network and broadcast
      infoDiv.textContent = `This network can provide up to ${totalIPs} usable IP addresses`;
    } catch (error) {
      infoDiv.textContent = 'Invalid network configuration';
    }
  }

  networkInput.addEventListener('input', updateInfo);
  startIPInput.addEventListener('input', updateInfo);
  endIPInput.addEventListener('input', updateInfo);
}

function createIPPool(formData) {
  const data = {
    name: formData.get('name'),
    network: formData.get('network'),
    gateway: formData.get('gateway'),
    startIP: formData.get('startIP'),
    endIP: formData.get('endIP'),
    interface: formData.get('interface')
  };

  const modal = document.getElementById('ip-pool-modal');
  const isEditing = modal.dataset.editing;

  const method = isEditing ? 'PUT' : 'POST';
  const url = isEditing ? `/api/ip-pools/${isEditing}` : '/api/ip-pools';

  const submitBtn = document.getElementById('ip-pool-submit-btn');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin mr-2">refresh</span>Saving...';
  submitBtn.disabled = true;

  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(err => {
        throw new Error(err.error || 'Server error');
      });
    }
    return response.json();
  })
  .then(result => {
    closeIPPoolModal();
    loadIPPools();
    showNotification(
      isEditing ? 'IP pool updated successfully' : 'IP pool created successfully',
      'success'
    );
  })
  .catch(error => {
    console.error('Error saving IP pool:', error);
    showNotification(error.message || 'Failed to save IP pool', 'error');
  })
  .finally(() => {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  });
}

function editIPPool(poolId) {
  // Fetch pool data
  fetch(`/api/ip-pools/${poolId}`, {
    credentials: 'include'
  })
  .then(response => response.json())
  .then(pool => {
    // Populate modal with pool data
    document.getElementById('ip-pool-name').value = pool.name;
    document.getElementById('ip-pool-network').value = pool.network;
    document.getElementById('ip-pool-gateway').value = pool.gateway;
    document.getElementById('ip-pool-interface').value = pool.interface || '';

    // Get start and end IPs from available IPs
    const availableIPs = pool.availableIPs;
    if (availableIPs.length > 0) {
      document.getElementById('ip-pool-start-ip').value = availableIPs[0];
      document.getElementById('ip-pool-end-ip').value = availableIPs[availableIPs.length - 1];
    }

    // Set editing state
    document.getElementById('ip-pool-modal').dataset.editing = poolId;
    document.getElementById('ip-pool-modal-title').textContent = 'Edit IP Pool';
    document.getElementById('ip-pool-submit-btn').innerHTML = '<span class="material-symbols-outlined mr-2">edit</span>Update IP Pool';

    // Disable name field when editing
    document.getElementById('ip-pool-name').disabled = true;

    // Populate network interfaces
    populateNetworkInterfaces();

    // Setup validation
    setupIPPoolValidation();

    // Show modal
    document.getElementById('ip-pool-modal').classList.remove('hidden');
    document.getElementById('ip-pool-modal').classList.add('flex');
  })
  .catch(error => {
    console.error('Error loading IP pool:', error);
    showNotification('Failed to load IP pool details', 'error');
  });
}

function deleteIPPool(poolId, poolName) {
  if (!confirm(`Delete IP pool "${poolName}"? This action cannot be undone and will release all assigned IPs.`)) {
    return;
  }

  fetch(`/api/ip-pools/${poolId}`, {
    method: 'DELETE',
    credentials: 'include'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to delete IP pool');
    }
    return response.json();
  })
  .then(result => {
    loadIPPools();
    showNotification('IP pool deleted successfully', 'success');
  })
  .catch(error => {
    console.error('Error deleting IP pool:', error);
    showNotification(error.message || 'Failed to delete IP pool', 'error');
  });
}

// Notification function
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
    type === 'success' ? 'bg-green-500' :
    type === 'error' ? 'bg-red-500' :
    'bg-blue-500'
  } text-white`;

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

  document.body.appendChild(notification);

  // Auto remove after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Mobile navigation functions
function setActiveNav(navId) {
  // Remove active class from all nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  // Add active class to clicked nav item
  const activeItem = document.querySelector(`.nav-item[data-nav="${navId}"]`);
  if (activeItem) {
    activeItem.classList.add('active');
  }
}

function toggleFabMenu() {
  const body = document.body;
  const isOpen = body.classList.contains('fab-menu-open');

  if (isOpen) {
    closeFabMenu();
  } else {
    openFabMenu();
  }
}

function openFabMenu() {
  document.body.classList.add('fab-menu-open');
}

function closeFabMenu() {
  document.body.classList.remove('fab-menu-open');
}

// Close FAB menu when clicking outside
document.addEventListener('click', function(event) {
  const fabButton = document.getElementById('fab-button');
  const fabMenu = document.getElementById('fab-menu');

  if (fabButton && fabMenu && !fabButton.contains(event.target) && !fabMenu.contains(event.target)) {
    closeFabMenu();
  }
});

function loadNetworks() {
  fetch('/api/networks')
  .then(response => response.json())
  .then(data => {
    const tbody = document.getElementById('networks-table-body');
    tbody.innerHTML = '';
    data.forEach(network => {
      const row = document.createElement('tr');
      row.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50';
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">${network.name}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${network.type}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
          <span class="material-symbols-outlined ${network.active ? 'text-green-500' : 'text-red-500'}">${network.active ? 'check_circle' : 'cancel'}</span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
          <span class="material-symbols-outlined ${network.autostart ? 'text-green-500' : 'text-red-500'}">${network.autostart ? 'check_circle' : 'cancel'}</span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
          <span class="material-symbols-outlined ${network.vlanaware ? 'text-green-500' : 'text-red-500'}">${network.vlanaware ? 'check_circle' : 'cancel'}</span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${network.ports || '-'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${network.cidr || '-'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${network.gateway || '-'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
          <button onclick="editNetwork('${network.name}')" class="text-primary hover:text-primary/80 mr-2">Edit</button>
          <button onclick="deleteNetwork('${network.name}')" class="text-red-500 hover:text-red-400">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  });
}

function showCreateNetworkModal() {
  document.getElementById('network-modal').classList.remove('hidden');
  document.getElementById('network-modal').classList.add('flex');
  // Reset form
  document.getElementById('create-network-form').reset();
  // Enable name field for creating
  document.getElementById('network-name').disabled = false;
  // Clear editing state
  delete document.getElementById('network-modal').dataset.editing;
  document.getElementById('modal-title').textContent = 'Create Network';
  document.getElementById('submit-btn').textContent = 'Create Network';
  // Always load interfaces when opening modal
  loadAvailableInterfaces();
}

function closeNetworkModal() {
  document.getElementById('network-modal').classList.add('hidden');
  document.getElementById('network-modal').classList.remove('flex');
  // Reset to create mode
  delete document.getElementById('network-modal').dataset.editing;
  document.getElementById('modal-title').textContent = 'Create Network';
  document.getElementById('submit-btn').textContent = 'Create Network';
  // Re-enable name field
  document.getElementById('network-name').disabled = false;
}

function loadAvailableInterfaces() {
  const interfaceList = document.getElementById('interface-list');
  interfaceList.innerHTML = '<p class="text-sm text-blue-500">Loading interfaces...</p>';
  
  // Add a small delay to see the loading message
  setTimeout(() => {
    fetch('/api/networks')
    .then(response => response.json())
    .then(data => {
      interfaceList.innerHTML = '';
      
      // Filter for physical interfaces that can be used as bridge ports
      const physicalInterfaces = data.filter(net => 
        net.type !== 'loopback' && 
        !net.name.startsWith('br') && 
        !net.name.startsWith('bond') && 
        !net.name.startsWith('virbr') &&
        !net.name.startsWith('vnet') &&
        net.name !== 'lo' &&
        (net.type === 'ether' || net.type === 'interface') &&
        (net.ports === "" || net.ports === null || net.ports === undefined)
      );
      
      if (physicalInterfaces.length === 0) {
        interfaceList.innerHTML = '<p class="text-sm text-slate-500 dark:text-slate-400">No available interfaces found</p>';
        return;
      }
      
      physicalInterfaces.forEach(iface => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'flex items-center';
        checkboxDiv.innerHTML = `
          <input type="checkbox" id="port-${iface.name}" name="bridgePorts" value="${iface.name}" class="mr-2">
          <label for="port-${iface.name}" class="text-sm text-slate-700 dark:text-slate-300">
            ${iface.name} (${iface.cidr || 'No IP'})
          </label>
        `;
        interfaceList.appendChild(checkboxDiv);
      });
    })
    .catch(error => {
      console.error('Error loading interfaces:', error);
      interfaceList.innerHTML = '<p class="text-sm text-red-500">Error loading interfaces</p>';
    });
  }, 500);
}

// Show/hide bridge ports based on type selection
document.getElementById('network-type').addEventListener('change', function() {
  const bridgePorts = document.getElementById('bridge-ports');
  if (this.value === 'bridge') {
    bridgePorts.classList.remove('hidden');
  } else {
    bridgePorts.classList.add('hidden');
  }
});

document.getElementById('create-network-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  const data = Object.fromEntries(formData);
  
  // Handle multiple bridge ports
  const bridgePorts = formData.getAll('bridgePorts');
  if (bridgePorts.length > 0) {
    data.bridgePorts = bridgePorts;
  }
  
  const modal = document.getElementById('network-modal');
  const isEditing = modal.dataset.editing;
  
  const method = isEditing ? 'PUT' : 'POST';
  const url = isEditing ? `/api/networks/${isEditing}` : '/api/networks';
  
  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(data => {
    alert(isEditing ? 'Network updated' : 'Network created');
    closeNetworkModal();
    loadNetworks();
  })
  .catch(error => console.error('Error:', error));
});

document.getElementById('create-ip-pool-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  createIPPool(formData);
});

function editNetwork(name) {
  // Find the network data
  fetch('/api/networks')
  .then(response => response.json())
  .then(data => {
    const network = data.find(net => net.name === name);
    if (network) {
      // Populate the modal with existing data
      const nameField = document.getElementById('network-name');
      nameField.value = network.name;
      nameField.disabled = true; // Can't change name when editing
      
      document.getElementById('network-type').value = network.type;
      document.getElementById('network-cidr').value = network.cidr || '';
      document.getElementById('network-gateway').value = network.gateway || '';
      
      // Handle bridge ports
      if (network.ports) {
        const ports = network.ports.split(', ');
        ports.forEach(port => {
          const checkbox = document.getElementById(`port-${port.trim()}`);
          if (checkbox) {
            checkbox.checked = true;
          }
        });
      }
      
      // Show/hide bridge ports based on type
      const bridgePorts = document.getElementById('bridge-ports');
      if (network.type === 'bridge') {
        bridgePorts.classList.remove('hidden');
      } else {
        bridgePorts.classList.add('hidden');
      }
      
      // Set editing mode
      document.getElementById('network-modal').dataset.editing = name;
      document.getElementById('modal-title').textContent = 'Edit Network';
      document.getElementById('submit-btn').textContent = 'Update Network';
      
      // Show modal
      document.getElementById('network-modal').classList.remove('hidden');
      document.getElementById('network-modal').classList.add('flex');
    }
  })
  .catch(error => console.error('Error:', error));
}

function deleteNetwork(name) {
  if (confirm('Delete network: ' + name + '?')) {
    fetch(`/api/networks/${name}`, {
      method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
      loadNetworks();
    })
    .catch(error => console.error('Error:', error));
  }
}

// Load initial data
// loadNetworks(); // Removed - now called conditionally in auth check

// Test interface loading on page load
document.addEventListener('DOMContentLoaded', function() {
  // Pre-load interfaces for the modal
  loadAvailableInterfaces();
});