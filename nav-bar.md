        <nav class="hidden md:flex items-center gap-6 text-sm font-medium">
          <a class="text-primary font-semibold" href="#" onclick="showSection('dashboard')">Dashboard</a>
          <a class="text-slate-700 dark:text-slate-300 hover:text-primary" href="/instances">Instances</a>
          <a class="text-slate-700 dark:text-slate-300 hover:text-primary" href="/images">Images</a>
          <a class="text-slate-700 dark:text-slate-300 hover:text-primary" href="/networks">Networks</a>
          <a class="text-slate-700 dark:text-slate-300 hover:text-primary" href="/storages">Storages</a>
        </nav>


curl -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' -c cookies.txt