const socket = io();

function loadImages() {
  fetch('/api/cloudinit-templates')
  .then(response => response.json())
  .then(data => {
    const list = document.getElementById('templates-list');
    list.innerHTML = '';
    data.forEach(template => {
      const card = document.createElement('div');
      card.className = 'rounded-xl bg-background-light dark:bg-background-dark clay-shadow p-6';
      card.innerHTML = `
        <div class="flex items-center gap-4 mb-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <span class="material-symbols-outlined">cloud</span>
          </div>
          <div class="flex-1">
            <p class="font-semibold text-slate-900 dark:text-white">${template.name}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400">${template.description || template.os + ' ' + (template.version || '')}</p>
          </div>
          <div class="flex gap-2">
            <button onclick="editTemplate('${template.id}')" class="p-2 text-slate-500 hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50" title="Edit">
              <span class="material-symbols-outlined text-sm">edit</span>
            </button>
            <button onclick="deleteTemplate('${template.id}')" class="p-2 text-slate-500 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50" title="Delete">
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
        </div>
        <button onclick="useTemplate('${template.id}')" class="w-full rounded-lg bg-primary py-2 font-semibold text-white transition hover:bg-primary/90">Use Template</button>
      `;
      list.appendChild(card);
    });

    // Add "Create Template" card
    const createCard = document.createElement('div');
    createCard.className = 'rounded-xl bg-background-light dark:bg-background-dark clay-shadow p-6 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-primary transition-colors cursor-pointer';
    createCard.onclick = showCreateTemplateModal;
    createCard.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full min-h-[120px] text-center">
        <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20 text-primary mb-4">
          <span class="material-symbols-outlined">add</span>
        </div>
        <p class="font-semibold text-slate-900 dark:text-white">Create Template</p>
        <p class="text-sm text-slate-500 dark:text-slate-400">Add a new CloudInit template</p>
      </div>
    `;
    list.appendChild(createCard);
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
          <div class="flex-1">
            <p class="font-semibold text-slate-900 dark:text-white">${iso}</p>
            <p class="text-sm text-slate-500 dark:text-slate-400">Custom ISO</p>
          </div>
          <div class="flex gap-2">
            <button onclick="deleteIso('${iso}')" class="p-2 text-slate-500 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50" title="Delete">
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
        </div>
        <button onclick="selectImage('${iso}', 'iso')" class="w-full rounded-lg bg-primary py-2 font-semibold text-white transition hover:bg-primary/90">Use ISO</button>
      `;
      list.appendChild(card);
    });
    
    // Add upload card at the end
    const uploadCard = document.createElement('div');
    uploadCard.className = 'rounded-xl bg-background-light dark:bg-background-dark clay-shadow p-6 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-primary transition-colors';
    uploadCard.innerHTML = `
      <label for="iso-upload" class="flex flex-col items-center justify-center h-full min-h-[120px] text-center cursor-pointer">
        <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20 text-primary mb-4">
          <span class="material-symbols-outlined">upload</span>
        </div>
        <p class="font-semibold text-slate-900 dark:text-white">Upload ISO</p>
        <p class="text-sm text-slate-500 dark:text-slate-400">Upload a new ISO image</p>
      </label>
      <input id="iso-upload" type="file" accept=".iso" class="hidden" onchange="uploadIso(this)">
    `;
    list.appendChild(uploadCard);
  });
}

function useTemplate(templateId) {
  // Redirect to instances page with template selected
  window.location.href = `/instances?template=${encodeURIComponent(templateId)}`;
}

function editTemplate(templateId) {
  // Load template details and show edit modal
  fetch(`/api/cloudinit-templates/${templateId}`)
  .then(response => response.json())
  .then(template => {
    showTemplateModal(template, templateId);
  })
  .catch(error => {
    console.error('Error loading template:', error);
    showNotification('Failed to load template', 'error');
  });
}

function deleteTemplate(templateId) {
  if (confirm('Are you sure you want to delete this template?')) {
    fetch(`/api/cloudinit-templates/${templateId}`, {
      method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        loadImages(); // Refresh the list
        showNotification('Template deleted successfully!', 'success');
      } else {
        showNotification('Failed to delete template: ' + data.error, 'error');
      }
    });
  }
}

function showCreateTemplateModal() {
  showTemplateModal(null, null);
}

function showTemplateModal(template = null, templateId = null) {
  const modal = document.getElementById('template-modal');
  const form = document.getElementById('template-form');
  const title = document.getElementById('modal-title');
  const templateIdField = document.getElementById('template-id');
  
  if (template) {
    title.textContent = 'Edit Template';
    templateIdField.value = templateId || '';
    templateIdField.readOnly = true;
    templateIdField.classList.add('bg-slate-100', 'dark:bg-slate-700', 'cursor-not-allowed');
    document.getElementById('template-name').value = template.name || '';
    document.getElementById('template-os').value = template.os || '';
    document.getElementById('template-version').value = template.version || '';
    document.getElementById('template-description').value = template.description || '';
    document.getElementById('template-image').value = template.image || '';
    document.getElementById('template-userdata').value = template.userDataTemplate || '';
  } else {
    title.textContent = 'Create Template';
    templateIdField.readOnly = false;
    templateIdField.classList.remove('bg-slate-100', 'dark:bg-slate-700', 'cursor-not-allowed');
    form.reset();
  }
  
  // Reset upload status
  document.getElementById('upload-status').textContent = '';
  
  modal.classList.remove('hidden');
  
  // Handle form submission
  form.onsubmit = (e) => {
    e.preventDefault();
    saveTemplate(templateId);
  };
}

function closeTemplateModal() {
  document.getElementById('template-modal').classList.add('hidden');
}

function saveTemplate(templateId) {
  const templateData = {
    name: document.getElementById('template-name').value,
    os: document.getElementById('template-os').value,
    version: document.getElementById('template-version').value,
    description: document.getElementById('template-description').value,
    image: document.getElementById('template-image').value,
    userDataTemplate: document.getElementById('template-userdata').value
  };
  
  // Only include id for new templates (POST), not for updates (PUT)
  if (!templateId) {
    templateData.id = document.getElementById('template-id').value;
  }
  
  const method = templateId ? 'PUT' : 'POST';
  const url = templateId ? `/api/cloudinit-templates/${templateId}` : '/api/cloudinit-templates';
  
  fetch(url, {
    method: method,
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(templateData)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success || data.id) {
      closeTemplateModal();
      loadImages();
      showNotification(`Template ${templateId ? 'updated' : 'created'} successfully!`, 'success');
    } else {
      showNotification(`Failed to ${templateId ? 'update' : 'create'} template: ${data.error}`, 'error');
    }
  })
  .catch(error => {
    console.error('Error saving template:', error);
    showNotification(`Failed to ${templateId ? 'update' : 'create'} template`, 'error');
  });
}

function deleteIso(isoName) {
  if (confirm(`Are you sure you want to delete the ISO "${isoName}"?`)) {
    fetch(`/api/isos/${encodeURIComponent(isoName)}`, {
      method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        loadIsos();
        showNotification('ISO deleted successfully!', 'success');
      } else {
        showNotification('Failed to delete ISO: ' + data.error, 'error');
      }
    })
    .catch(error => {
      console.error('Error deleting ISO:', error);
      showNotification('Failed to delete ISO', 'error');
    });
  }
}

function uploadIso(input) {
  const file = input.files[0];
  if (!file) return;
  
  const formData = new FormData();
  formData.append('iso', file);
  
  fetch('/api/upload-iso', {
    method: 'POST',
    credentials: 'include',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      loadIsos();
      showNotification('ISO uploaded successfully!', 'success');
    } else {
      showNotification('Failed to upload ISO: ' + data.error, 'error');
    }
  })
  .catch(error => {
    console.error('Error uploading ISO:', error);
    showNotification('Failed to upload ISO', 'error');
  });
  
  // Reset input
  input.value = '';
}

function handleImageUpload(input) {
  const file = input.files[0];
  if (!file) return;
  
  const statusElement = document.getElementById('upload-status');
  statusElement.textContent = 'Uploading...';
  statusElement.className = 'text-xs text-blue-500';
  
  const formData = new FormData();
  formData.append('image', file);
  
  fetch('/api/upload-base-image', {
    method: 'POST',
    credentials: 'include',
    body: formData
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Set the uploaded filename in the text input
      document.getElementById('template-image').value = data.filename;
      statusElement.textContent = 'Upload successful!';
      statusElement.className = 'text-xs text-green-500';
      showNotification('Base image uploaded successfully!', 'success');
    } else {
      statusElement.textContent = 'Upload failed: ' + data.error;
      statusElement.className = 'text-xs text-red-500';
      showNotification('Failed to upload base image: ' + data.error, 'error');
    }
  })
  .catch(error => {
    console.error('Error uploading base image:', error);
    statusElement.textContent = 'Upload failed';
    statusElement.className = 'text-xs text-red-500';
    showNotification('Failed to upload base image', 'error');
  });
  
  // Reset input
  input.value = '';
}

function showNotification(message, type = 'info') {
  // Simple notification function
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 px-4 py-2 rounded-lg text-white z-50 ${
    type === 'success' ? 'bg-green-500' : 
    type === 'error' ? 'bg-red-500' : 'bg-blue-500'
  }`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    document.body.removeChild(notification);
  }, 3000);
}

// Tab switching
document.getElementById('tab-templates').addEventListener('click', () => {
  document.getElementById('tab-templates').classList.add('text-primary', 'border-primary');
  document.getElementById('tab-templates').classList.remove('text-slate-500', 'dark:text-slate-400', 'border-transparent');
  document.getElementById('tab-isos').classList.remove('text-primary', 'border-primary');
  document.getElementById('tab-isos').classList.add('text-slate-500', 'dark:text-slate-400', 'border-transparent');
  document.getElementById('templates-list').classList.remove('hidden');
  document.getElementById('isos-list').classList.add('hidden');
});

document.getElementById('tab-isos').addEventListener('click', () => {
  document.getElementById('tab-isos').classList.add('text-primary', 'border-primary');
  document.getElementById('tab-isos').classList.remove('text-slate-500', 'dark:text-slate-400', 'border-transparent');
  document.getElementById('tab-templates').classList.remove('text-primary', 'border-primary');
  document.getElementById('tab-templates').classList.add('text-slate-500', 'dark:text-slate-400', 'border-transparent');
  document.getElementById('isos-list').classList.remove('hidden');
  document.getElementById('templates-list').classList.add('hidden');
});

// Load initial data
loadImages();
loadIsos();