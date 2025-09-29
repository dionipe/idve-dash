const socket = io();

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
loadNetworks();

// Test interface loading on page load
document.addEventListener('DOMContentLoaded', function() {
  // Pre-load interfaces for the modal
  loadAvailableInterfaces();
});