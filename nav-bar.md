        <nav class="hidden md:flex items-center gap-6 text-sm font-medium">
          <a class="text-primary font-semibold" href="#" onclick="showSection('dashboard')">Dashboard</a>
          <a class="text-slate-700 dark:text-slate-300 hover:text-primary" href="/instances">Instances</a>
          <a class="text-slate-700 dark:text-slate-300 hover:text-primary" href="/images">Images</a>
          <a class="text-slate-700 dark:text-slate-300 hover:text-primary" href="/networks">Networks</a>
          <a class="text-slate-700 dark:text-slate-300 hover:text-primary" href="/storages">Storages</a>
        </nav>

Halaman diluar nav-bar, yaitu halaman vm-detail


curl -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' -c cookies.txt
curl -X PUT http://localhost:3000/api/instances/cloudinit-1759133003456/start -H "Content-Type: application/json" -b cookies.txt
curl -X PUT http://localhost:3000/api/instances/cloudinit-1759133003456/stop -H "Content-Type: application/json" -b cookies.txt

CEPH_ARGS="--conf=/tmp/ceph-cleanup.conf --id=admin" rbd info idve/cloudinit-1759131350486

-H "Content-Type: application/json" -b cookies.txt 