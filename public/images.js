const socket = io();

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
  // Since it's a separate page, redirect to main with params or something
  window.location.href = `/?image=${encodeURIComponent(path)}&type=${type}`;
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