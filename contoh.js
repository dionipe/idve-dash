app.post('/api/instances/cloudinit', async (req, res) => {
  const { name, os, ram, cpu, storage, storageType, vgName, hostname, username, password, ip, gateway, dns, sshkey, template, bridge } = req.body;

  // Sanitize name: replace spaces with dashes
  const sanitizedName = name.replace(/\s+/g, '-');

  // Parse IP and CIDR
  let ipAddr = '', cidr = '24', netmask = '255.255.255.0';
  if (ip) {
    [ipAddr, cidr] = ip.split('/');
    netmask = cidrToNetmask(cidr);
  }

  // Create VM directory
  const vmDir = path.join(VMS_DIR, sanitizedName);
  if (!fs.existsSync(vmDir)) {
    fs.mkdirSync(vmDir, { recursive: true });
  }

  // Create disk based on storage type
  let diskPath;
  if (storageType === 'lvm' && vgName) {
    // Create LVM logical volume
    const lvName = `${sanitizedName}-disk`;
    await createLV(vgName, lvName, storage);
    diskPath = `/dev/${vgName}/${lvName}`;
  } else {
    // Create qcow2 disk image (default)
    diskPath = path.join(vmDir, `${sanitizedName}.qcow2`);
    let createCmd;
    if (template) {
      const baseImage = path.join(IMAGES_DIR, template);
      // Create COW image from template, then resize it
      createCmd = `qemu-img create -f qcow2 -F qcow2 -b "${baseImage}" "${diskPath}" && qemu-img resize "${diskPath}" ${storage}G`;
    } else {
      createCmd = `qemu-img create -f qcow2 "${diskPath}" ${storage}G`;
    }
    
    await new Promise((resolve, reject) => {
      exec(createCmd, (err) => {
        if (err) {
          reject(new Error('Error creating disk'));
        } else {
          resolve();
        }
      });
    });
  }

  // Create cloud-init files
  let userData;
  if (os.toLowerCase() === 'freebsd') {
      // FreeBSD cloud-init configuration
      userData = `#cloud-config
        hostname: ${hostname}
        users:
          - name: ${username}
            lock_passwd: false
            sudo: ALL=(ALL) NOPASSWD:ALL
            groups: wheel
            shell: /bin/sh
            ssh_authorized_keys:
              - ${sshkey}
        chpasswd:
          list: |
            ${username}:${password}
          expire: false
        ssh_pwauth: true
        packages:
          - openssh-portable
          - qemu-guest-agent
        runcmd:
          - sysrc sshd_enable=YES
          - service sshd start
          - echo "${username}:${password}" | chpasswd
          - sed -i '' 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config
          - service sshd restart
        `;
      } else {
        // Linux cloud-init configuration
      userData = `#cloud-config
        hostname: ${hostname}
        users:
          - name: ${username}
            lock_passwd: false
            sudo: ALL=(ALL) NOPASSWD:ALL
            groups: users, admin
            shell: /bin/bash
            ssh_authorized_keys:
              - ${sshkey}
        chpasswd:
          list: |
            ${username}:${password}
          expire: false
        ssh_pwauth: true
        disk_setup:
          /dev/vda:
            table_type: gpt
            layout: true
            overwrite: false
        fs_setup:
          - label: cloudimg-rootfs
            filesystem: ext4
            device: /dev/vda1
            partition: auto
            overwrite: false
        growpart:
          mode: auto
          devices: ['/']
          ignore_growroot_disabled: false
        packages:
          - openssh-server
          - net-tools
          - qemu-guest-agent
          - cloud-guest-utils
          - gdisk
        runcmd:
          - systemctl enable ssh
          - systemctl start ssh
          - echo "${username}:${password}" | chpasswd
          - sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config
          - systemctl restart ssh
          - growpart /dev/vda 1
          - resize2fs /dev/vda1
          - df -h
        `;
    }

    const metaData = `instance-id: ${sanitizedName}
      local-hostname: ${hostname}
      `;

    // Create network config for static IP or DHCP
    let networkConfig = '';
    if (ip && gateway && dns) {
      // Static IP configuration - all fields provided
      const [ipAddr, cidr] = ip.split('/');
      const netmask = cidrToNetmask(cidr);
      networkConfig = `network:
  version: 2
  ethernets:
    ens3:
      addresses:
        - ${ipAddr}/${cidr}
      gateway4: ${gateway}
      nameservers:
        addresses:
          - ${dns}
      match:
        macaddress: "52:54:00:12:34:56"
      set-name: ens3
`;
    } else if (ip && gateway) {
      // Static IP with gateway but no custom DNS (use default)
      const [ipAddr, cidr] = ip.split('/');
      networkConfig = `network:
  version: 2
  ethernets:
    ens3:
      addresses:
        - ${ipAddr}/${cidr}
      gateway4: ${gateway}
      nameservers:
        addresses:
          - 8.8.8.8
          - 8.8.4.4
      match:
        macaddress: "52:54:00:12:34:56"
      set-name: ens3
`;
    } else if (ip) {
      // Static IP without gateway (might not work well, but allow it)
      const [ipAddr, cidr] = ip.split('/');
      networkConfig = `network:
  version: 2
  ethernets:
    ens3:
      addresses:
        - ${ipAddr}/${cidr}
      nameservers:
        addresses:
          - 8.8.8.8
          - 8.8.4.4
      match:
        macaddress: "52:54:00:12:34:56"
      set-name: ens3
`;
    } else {
      // DHCP configuration
      networkConfig = `network:
  version: 2
  ethernets:
    ens3:
      dhcp4: true
      dhcp6: true
      match:
        macaddress: "52:54:00:12:34:56"
      set-name: ens3
`;
    }

    fs.writeFileSync(path.join(vmDir, 'user-data'), userData);
    fs.writeFileSync(path.join(vmDir, 'meta-data'), metaData);
    fs.writeFileSync(path.join(vmDir, 'network-config'), networkConfig);

    // Create cloud-init ISO with network config
    const seedIso = path.join(vmDir, 'seed.iso');
    exec(`cloud-localds -N "${path.join(vmDir, 'network-config')}" "${seedIso}" "${path.join(vmDir, 'user-data')}" "${path.join(vmDir, 'meta-data')}"`, async (err) => {
      if (err) {
        console.error('Error creating ISO:', err);
        return res.status(500).send('Error creating ISO');
      }

      // Insert VM into JSON
      const vms = await loadVMs();
      const newVM = {
        id: Date.now(), // Simple ID
        name: sanitizedName,
        status: 'stopped',
        // Hardware specs
        os: os,
        ram: ram,
        cpu: cpu,
        storage: storage,
        storageType: storageType || 'qcow2',
        vgName: vgName || '',
        bridge: bridge,
        // Cloud-init config
        hostname: hostname,
        username: username,
        password: password,
        sshkey: sshkey,
        ip: ip || '',
        gateway: gateway || '',
        dns: dns || '',
        template: template || '',
        bootOrder: 'hd' // Default boot order
      };
      vms.push(newVM);
      await saveVMs(vms);
      const vmId = newVM.id;

      // Start VM with bridge networking
      const vncPort = (vmId % 100); // Use ID mod 100 for VNC port
            const qemuCmd = `qemu-system-x86_64 -m ${newVM.ram} -smp ${newVM.cpu} -hda "${diskPath}" -cdrom "${seedIso}" -boot d,menu=on,splash=/root/infradash/public/images/IDVE-bios.png,splash-time=3000 -netdev bridge,id=net0,br=${newVM.bridge || 'vmbr0'} -device virtio-net-pci,netdev=net0 -chardev socket,path=/tmp/${newVM.name.replace(/\s+/g, '-')}-qga.sock,server,nowait,id=qga0 -device virtio-serial -device virtio-serial-pci,id=virtio-serial0 -device virtserialport,chardev=qga0,name=org.qemu.guest_agent.0 -vnc :${vncPort} -daemonize`;
      exec(qemuCmd, async (err) => {
        if (err) {
          console.error('Error starting VM:', err);
          // Update status to error or something
          const vms2 = await loadVMs();
          const vmIndex = vms2.findIndex(v => v.id === vmId);
          if (vmIndex !== -1) {
            vms2[vmIndex].status = 'error';
            await saveVMs(vms2);
          }
          return res.status(500).send('Error starting VM');
        }

        // Update status
        const vms2 = await loadVMs();
        const vmIndex = vms2.findIndex(v => v.id === vmId);
        if (vmIndex !== -1) {
          vms2[vmIndex].status = 'running';
          await saveVMs(vms2);
        }
        res.redirect('/');
      });
    });
  });

