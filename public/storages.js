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
    // Initialize if authenticated
    loadStorages();
  }
  
  // Setup login form
  document.addEventListener('submit', function(e) {
    if (e.target.id === 'login-form') {
      handleLogin(e);
    }
  });
});

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
          ${storage.type === 'RBD' ? `<button onclick="viewRbdImages('${storage.name}')" class="text-blue-500 hover:text-blue-400 mr-2">View RBD Disks</button>` : ''}
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
// loadStorages(); // Removed - now called conditionally in auth check

// RBD Images functions
let currentRbdStorage = null;

function viewRbdImages(storageName) {
  currentRbdStorage = storageName;
  document.getElementById('rbd-storage-name').textContent = storageName;
  document.getElementById('rbd-images-modal').classList.remove('hidden');
  document.getElementById('rbd-images-modal').classList.add('flex');
  loadRbdImages();
}

function closeRbdImagesModal() {
  document.getElementById('rbd-images-modal').classList.add('hidden');
  document.getElementById('rbd-images-modal').classList.remove('flex');
  currentRbdStorage = null;
}

function loadRbdImages() {
  if (!currentRbdStorage) return;

  const loadingIndicator = document.getElementById('rbd-loading-indicator');
  const noImagesDiv = document.getElementById('rbd-no-images');
  const tableBody = document.getElementById('rbd-images-table-body');
  const imagesCount = document.getElementById('rbd-images-count');

  // Show loading
  loadingIndicator.classList.remove('hidden');
  noImagesDiv.classList.add('hidden');
  tableBody.innerHTML = '';

  fetch(`/api/storages/${currentRbdStorage}/rbd-images`)
  .then(response => response.json())
  .then(data => {
    loadingIndicator.classList.add('hidden');

    if (data.error) {
      console.error('Error loading RBD images:', data.error);
      noImagesDiv.classList.remove('hidden');
      noImagesDiv.innerHTML = `
        <span class="material-symbols-outlined text-4xl mb-2">error</span>
        <p>Error loading RBD images: ${data.error}</p>
      `;
      imagesCount.textContent = '0';
      return;
    }

    if (!data.images || data.images.length === 0) {
      noImagesDiv.classList.remove('hidden');
      imagesCount.textContent = '0';
      return;
    }

    // Update pool name
    document.getElementById('rbd-pool-name').textContent = data.pool || 'Unknown';

    // Update count
    imagesCount.textContent = data.images.length;

    // Populate table
    data.images.forEach(image => {
      const row = document.createElement('tr');
      row.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/50';

      const sizeGB = image.size ? (image.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : '-';
      
      // Helper function to parse timestamps more robustly
      function parseTimestamp(timestamp) {
        if (!timestamp) return '-';
        
        // If it's already a formatted date string from RBD, return as-is
        if (typeof timestamp === 'string' && timestamp.includes(' ')) {
          return timestamp;
        }
        
        try {
          // Try different timestamp formats for backward compatibility
          let date;
          
          // If it's a number, try as milliseconds first, then as seconds
          if (typeof timestamp === 'number') {
            // First try as milliseconds (if > 1e12, it's likely milliseconds)
            if (timestamp > 1e12) {
              date = new Date(timestamp);
            } else {
              // Try as seconds
              date = new Date(timestamp * 1000);
            }
          } else if (typeof timestamp === 'string') {
            // Try parsing as ISO string or other string format
            date = new Date(timestamp);
          }
          
          // Check if date is valid
          if (date && !isNaN(date.getTime())) {
            return date.toLocaleString();
          }
          
          return timestamp || '-';
        } catch (error) {
          console.warn('Error parsing timestamp:', timestamp, error);
          return timestamp || '-';
        }
      }
      
      const created = parseTimestamp(image.create_timestamp);
      const modified = parseTimestamp(image.modification_timestamp);
      
      // Format features as badges
      const featuresHtml = image.features && image.features.length > 0 
        ? image.features.map(feature => `<span class="inline-block bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs px-2 py-1 rounded-full mr-1 mb-1">${feature}</span>`).join('')
        : '-';

      row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white max-w-xs truncate" title="${image.name}">${image.name}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400 font-mono">${sizeGB}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
            v${image.format || '1'}
          </span>
        </td>
        <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 max-w-xs">
          <div class="flex flex-wrap gap-1">
            ${featuresHtml}
          </div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400 font-mono">${created}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400 font-mono">${modified}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
          <button onclick="deleteRbdImage('${image.name}')" class="inline-flex items-center px-3 py-1.5 border border-red-300 dark:border-red-600 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg text-sm font-medium transition-colors duration-200">
            <span class="material-symbols-outlined text-sm mr-1">delete</span>
            Delete
          </button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  })
  .catch(error => {
    console.error('Error loading RBD images:', error);
    loadingIndicator.classList.add('hidden');
    noImagesDiv.classList.remove('hidden');
    noImagesDiv.innerHTML = `
      <span class="material-symbols-outlined text-4xl mb-2">error</span>
      <p>Error loading RBD images</p>
    `;
    imagesCount.textContent = '0';
  });
}

function deleteRbdImage(imageName) {
  if (!confirm(`Delete RBD image: ${imageName}? This action cannot be undone.`)) {
    return;
  }

  fetch(`/api/storages/${currentRbdStorage}/rbd-images/${imageName}`, {
    method: 'DELETE'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  })
  .then(data => {
    if (data.success) {
      loadRbdImages(); // Refresh the list
      alert(`RBD image "${imageName}" deleted successfully.`);
    } else {
      alert('Error deleting RBD image: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(error => {
    console.error('Error deleting RBD image:', error);
    alert('Error deleting RBD image: ' + error.message);
  });
}

// Search functionality for RBD images
document.getElementById('rbd-search').addEventListener('input', function() {
  const searchTerm = this.value.toLowerCase();
  const rows = document.querySelectorAll('#rbd-images-table-body tr');

  rows.forEach(row => {
    const imageName = row.cells[0].textContent.toLowerCase();
    if (imageName.includes(searchTerm)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
});