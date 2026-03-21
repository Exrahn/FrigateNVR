# Installing FrigateNVR on Proxmox with Docker (LXC Container)

This guide walks through setting up FrigateNVR inside a Proxmox LXC container using Docker. This approach gives you near-native performance with minimal overhead.

## Prerequisites

- **Proxmox VE** 7.x or 8.x
- A storage pool with at least **40 GB** free (SSD recommended for recordings)
- A CT template: **Debian 12** or **Ubuntu 22.04/24.04**
- (Optional) Google Coral TPU USB or PCIe for hardware-accelerated detection
- (Optional) Intel iGPU, AMD, or NVIDIA GPU for hardware-accelerated video decoding

---

## Step 1: Create the LXC Container

### Option A: Using the Proxmox Web UI

1. Go to your Proxmox node → **Create CT**
2. Configure:

   | Setting         | Recommended Value                          |
   |-----------------|--------------------------------------------|
   | **Hostname**    | `frigate`                                  |
   | **Template**    | `debian-12-standard` or `ubuntu-24.04`     |
   | **Disk**        | 40 GB+ (SSD preferred)                     |
   | **CPU**         | 2–4 cores                                  |
   | **Memory**      | 2048–4096 MB                               |
   | **Swap**        | 512 MB                                     |
   | **Network**     | DHCP or static IP, bridge `vmbr0`          |
   | **Unprivileged**| **No** (required for device passthrough)   |
   | **Nesting**     | **Yes** (required for Docker)              |

3. **Important**: Check **"Nesting"** under Features (required for Docker inside LXC).
4. Uncheck **"Unprivileged container"** if you need hardware passthrough (Coral, GPU).

### Option B: Using the CLI

```bash
# On the Proxmox host
pct create 200 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname frigate \
  --memory 4096 \
  --swap 512 \
  --cores 4 \
  --rootfs local-lvm:40 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --features nesting=1 \
  --unprivileged 0 \
  --start 1
```

> **Note**: Adjust `local:vztmpl/...` to match your actual template path. List available templates with `pveam list local`.

---

## Step 2: Configure Device Passthrough (Optional)

If you need GPU or Coral TPU access, add device mappings to the container config.

### On the Proxmox host:

```bash
nano /etc/pve/lxc/200.conf
```

Add the relevant lines:

### Google Coral USB TPU

```conf
lxc.cgroup2.devices.allow: c 189:* rwm
lxc.mount.entry: /dev/bus/usb dev/bus/usb none bind,optional,create=dir
```

### Intel iGPU (Quick Sync / VAAPI)

```conf
lxc.cgroup2.devices.allow: c 226:* rwm
lxc.mount.entry: /dev/dri dev/dri none bind,optional,create=dir
```

### NVIDIA GPU

For NVIDIA, consider using a VM instead of LXC, or use the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) approach.

After editing, restart the container:

```bash
pct stop 200 && pct start 200
```

---

## Step 3: Install Docker Inside the LXC

Enter the container:

```bash
pct enter 200
```

Then install Docker:

```bash
# Update and install prerequisites
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg

# Add Docker GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository (Debian)
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify
docker --version
docker compose version
```

> **Ubuntu users**: Replace `debian` with `ubuntu` in the repository URL above.

---

## Step 4: Prepare the Frigate Directory Structure

```bash
mkdir -p /opt/frigate/config
mkdir -p /opt/frigate/storage
```

### Create the Frigate Configuration

```bash
cat > /opt/frigate/config/config.yml << 'EOF'
mqtt:
  enabled: false
  # Uncomment and configure if you use MQTT:
  # host: 192.168.1.100
  # port: 1883
  # user: mqtt_user
  # password: mqtt_password

detectors:
  cpu:
    type: cpu
  # Uncomment for Coral USB TPU:
  # coral:
  #   type: edgetpu
  #   device: usb

cameras:
  front_door:
    enabled: true
    ffmpeg:
      inputs:
        - path: rtsp://user:password@192.168.1.10:554/stream1
          roles:
            - detect
            - record
    detect:
      width: 1280
      height: 720
      fps: 5
    record:
      enabled: true
      retain:
        days: 7
        mode: motion
      events:
        retain:
          default: 14
          mode: active_objects
    snapshots:
      enabled: true
      retain:
        default: 14

  # Add more cameras here...

# Optional: Hardware acceleration for ffmpeg
# ffmpeg:
#   hwaccel_args: preset-vaapi  # Intel iGPU
#   # hwaccel_args: preset-nvidia  # NVIDIA GPU
EOF
```

Edit this file to match your camera setup:

```bash
nano /opt/frigate/config/config.yml
```

---

## Step 5: Create the Docker Compose File

```bash
cat > /opt/frigate/docker-compose.yml << 'EOF'
services:
  frigate:
    container_name: frigate
    image: ghcr.io/blakeblackshear/frigate:stable
    restart: unless-stopped
    privileged: true
    shm_size: "256mb"
    ports:
      - "5000:5000"   # Web UI
      - "8554:8554"   # RTSP restream
      - "8555:8555"   # WebRTC (TCP)
      - "8555:8555/udp" # WebRTC (UDP)
    volumes:
      - /etc/localtime:/etc/localtime:ro
      - ./config:/config
      - ./storage:/media/frigate
    environment:
      - FRIGATE_RTSP_PASSWORD=changeme
    # Uncomment for Coral USB TPU:
    # devices:
    #   - /dev/bus/usb:/dev/bus/usb
    # Uncomment for Intel iGPU (VAAPI):
    # devices:
    #   - /dev/dri/renderD128:/dev/dri/renderD128
EOF
```

### Shared Memory Size

The `shm_size` controls memory for frame processing. Recommended values:

| Cameras | shm_size |
|---------|----------|
| 1–3     | 128mb    |
| 4–6     | 256mb    |
| 7–12    | 512mb    |
| 12+     | 1gb      |

---

## Step 6: Start Frigate

```bash
cd /opt/frigate
docker compose up -d
```

Check the logs:

```bash
docker compose logs -f frigate
```

Wait for Frigate to finish starting (you should see `Frigate is running`).

---

## Step 7: Access the Web UI

Open your browser and navigate to:

```
http://<CONTAINER_IP>:5000
```

To find your container's IP:

```bash
hostname -I
```

---

## Step 8: Enable Auto-Start on Boot

Docker containers with `restart: unless-stopped` will automatically restart. Ensure Docker itself starts on boot:

```bash
systemctl enable docker
```

---

## Maintenance

### Update Frigate

```bash
cd /opt/frigate
docker compose pull
docker compose up -d
```

### View Logs

```bash
docker compose logs -f frigate
```

### Backup Configuration

```bash
cp -r /opt/frigate/config /root/frigate-config-backup
```

### Monitor Resource Usage

```bash
docker stats frigate
```

---

## Troubleshooting

### Container won't start / Docker errors

Make sure **nesting** is enabled in the LXC config:

```bash
# On Proxmox host
pct set 200 --features nesting=1
pct stop 200 && pct start 200
```

### Permission denied for /dev/dri or /dev/bus/usb

- Ensure the container is **privileged** (not unprivileged)
- Verify the `lxc.cgroup2.devices.allow` and `lxc.mount.entry` lines in `/etc/pve/lxc/200.conf`

### High CPU usage

- Enable hardware acceleration in `config.yml` (`ffmpeg.hwaccel_args`)
- Add a Coral TPU for detection offloading
- Reduce `detect.fps` for cameras (3–5 fps is usually sufficient)

### Recordings eating disk space

- Adjust `record.retain.days` in your camera config
- Set `record.retain.mode: motion` to only keep motion segments
- Monitor with `du -sh /opt/frigate/storage/`

---

## Architecture Overview

```
Proxmox Host
└── LXC Container (CT 200 - Debian 12)
    └── Docker Engine
        └── Frigate Container (ghcr.io/blakeblackshear/frigate:stable)
            ├── Port 5000  → Web UI
            ├── Port 8554  → RTSP Restream
            ├── Port 8555  → WebRTC
            ├── /config    → config.yml
            └── /media     → Recordings & Snapshots
```

---

## Further Reading

- [Frigate Documentation](https://docs.frigate.video)
- [Frigate Docker Installation](https://docs.frigate.video/frigate/installation)
- [Proxmox LXC Documentation](https://pve.proxmox.com/wiki/Linux_Container)
- [Hardware Acceleration Guide](https://docs.frigate.video/configuration/hardware_acceleration)
