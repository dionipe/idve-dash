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

let currentEditingStorage = null;

function loadStorages() {
  fetch('/api/storages')
  .then(response => response.json())
  .then(data => {
    const tbody = document.getElementById('storages-table-body');
    tbody.innerHTML = '';
    data.forEach(storage => {
      const row = document.createElement('tr');
      row.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50';
      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">${storage.name}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${storage.type}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${storage.content}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${storage.type === 'RBD' ? storage.pool : storage.path}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${storage.capacity || '-'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">${storage.shared}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
          <span class="material-symbols-outlined ${storage.enabled ? 'text-green-500' : 'text-red-500'}">${storage.enabled ? 'check_circle' : 'cancel'}</span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
          <button onclick="editStorage('${storage.name}')" class="text-primary hover:text-primary/80 mr-2">Edit</button>
          <button onclick="deleteStorage('${storage.name}')" class="text-red-500 hover:text-red-400">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  });
}

function showCreateStorageModal() {
  currentEditingStorage = null;
  document.getElementById('modal-title').textContent = 'Create Storage';
  document.getElementById('modal-submit-btn').textContent = 'Create';
  document.getElementById('storage-modal').classList.remove('hidden');
  document.getElementById('storage-modal').classList.add('flex');
  // Reset form
  document.getElementById('create-storage-form').reset();
  // Hide RBD fields initially
  document.getElementById('rbd-fields').classList.add('hidden');
  // Make path field required initially
  document.getElementById('storage-path').required = true;
}

function closeStorageModal() {
  document.getElementById('storage-modal').classList.add('hidden');
  document.getElementById('storage-modal').classList.remove('flex');
  currentEditingStorage = null;
}

// Handle storage type change to show/hide RBD fields
document.getElementById('storage-type').addEventListener('change', function() {
  const rbdFields = document.getElementById('rbd-fields');
  const pathField = document.getElementById('storage-path');
  
  if (this.value === 'RBD') {
    rbdFields.classList.remove('hidden');
    pathField.required = false; // Path not required for RBD
  } else {
    rbdFields.classList.add('hidden');
    pathField.required = true; // Path required for other types
  }
});

document.getElementById('create-storage-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  const data = Object.fromEntries(formData);
  
  const url = currentEditingStorage ? `/api/storages/${currentEditingStorage.name}` : '/api/storages';
  const method = currentEditingStorage ? 'PUT' : 'POST';
  
  fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(data => {
    alert(currentEditingStorage ? 'Storage updated' : 'Storage created');
    closeStorageModal();
    loadStorages();
  })
  .catch(error => console.error('Error:', error));
});

function editStorage(name) {
  // Fetch current storage data
  fetch('/api/storages')
  .then(response => response.json())
  .then(data => {
    const storage = data.find(s => s.name === name);
    if (!storage) {
      alert('Storage not found');
      return;
    }
    
    currentEditingStorage = storage;
    document.getElementById('modal-title').textContent = 'Edit Storage';
    document.getElementById('modal-submit-btn').textContent = 'Update';
    document.getElementById('storage-modal').classList.remove('hidden');
    document.getElementById('storage-modal').classList.add('flex');
    
    // Populate form with existing data
    document.getElementById('storage-name').value = storage.name;
    document.getElementById('storage-type').value = storage.type;
    document.getElementById('storage-content').value = storage.content;
    document.getElementById('storage-path').value = storage.path || '';
    
    // Handle RBD fields
    if (storage.type === 'RBD') {
      document.getElementById('rbd-fields').classList.remove('hidden');
      document.getElementById('storage-path').required = false;
      document.getElementById('storage-monitors').value = storage.monitors || '';
      document.getElementById('storage-pool').value = storage.pool || '';
      document.getElementById('storage-username').value = storage.username || '';
      document.getElementById('storage-key').value = storage.key || '';
    } else {
      document.getElementById('rbd-fields').classList.add('hidden');
      document.getElementById('storage-path').required = true;
    }
  })
  .catch(error => console.error('Error:', error));
}

function deleteStorage(name) {
  if (confirm('Delete storage: ' + name + '?')) {
    fetch(`/api/storages/${name}`, {
      method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
      loadStorages();
    })
    .catch(error => console.error('Error:', error));
  }
}

// Load initial data
loadStorages();