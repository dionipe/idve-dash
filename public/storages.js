const socket = io();

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
  fetch('/api/storages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(data => {
    alert('Storage created');
    closeStorageModal();
    loadStorages();
  })
  .catch(error => console.error('Error:', error));
});

function editStorage(name) {
  // Implement edit functionality
  alert('Edit storage: ' + name);
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