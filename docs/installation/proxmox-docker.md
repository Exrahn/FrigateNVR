# Déploiement FrigateNVR sur Proxmox — Guide complet

Ce guide couvre l'installation complète de FrigateNVR dans un conteneur LXC Proxmox avec Docker, HTTPS via Nginx (certificat auto-signé), et le frontend modernisé.

---

## Table des matières

1. [Créer le conteneur LXC](#étape-1--créer-le-conteneur-lxc)
2. [Passthrough matériel (optionnel)](#étape-2--passthrough-matériel-optionnel)
3. [Installer Docker](#étape-3--installer-docker)
4. [Préparer la structure des dossiers](#étape-4--préparer-la-structure-des-dossiers)
5. [Configurer Frigate](#étape-5--configurer-frigate)
6. [Déployer avec Docker Compose + Nginx HTTPS](#étape-6--déployer-avec-docker-compose--nginx-https)
7. [Configurer Nginx (HTTPS)](#étape-7--configurer-nginx-https)
8. [Builder le frontend modernisé](#étape-8--builder-le-frontend-modernisé)
9. [Démarrer et vérifier](#étape-9--démarrer-et-vérifier)
10. [Maintenance](#maintenance)
11. [Dépannage](#dépannage)

---

## Prérequis

- **Proxmox VE** 7.x ou 8.x
- **40 Go** de stockage minimum (SSD recommandé pour les enregistrements)
- Template CT : **Debian 12** (recommandé) ou Ubuntu 22.04/24.04
- (Optionnel) Google Coral TPU USB/PCIe pour la détection accélérée
- (Optionnel) Intel iGPU, AMD ou NVIDIA pour le décodage vidéo matériel

---

## Étape 1 : Créer le conteneur LXC

### Via l'interface Proxmox

1. Aller sur le nœud Proxmox → **Créer CT**
2. Paramètres recommandés :

   | Paramètre        | Valeur recommandée                        |
   |------------------|-------------------------------------------|
   | **Hostname**     | `frigate`                                 |
   | **Template**     | `debian-12-standard`                      |
   | **Disque**       | 40 Go+ (SSD)                              |
   | **CPU**          | 4 cœurs                                   |
   | **Mémoire**      | 6144 Mo (6 Go — nécessaire pour le build) |
   | **Swap**         | 512 Mo                                    |
   | **Réseau**       | IP statique ou DHCP, bridge `vmbr0`       |
   | **Non privilégié** | **Non** (requis pour passthrough)       |
   | **Nesting**      | **Oui** (requis pour Docker)              |

3. Cocher **Nesting** dans les fonctionnalités.
4. Décocher **Conteneur non privilégié** si tu as besoin de passthrough matériel.

### Via CLI (sur le host Proxmox)

```bash
pct create 200 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname frigate \
  --memory 6144 \
  --swap 512 \
  --cores 4 \
  --rootfs local-lvm:40 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --features nesting=1 \
  --unprivileged 0 \
  --start 1
```

> Lister les templates disponibles : `pveam list local`

---

## Étape 2 : Passthrough matériel (optionnel)

Sur le **host Proxmox**, édite la config du conteneur :

```bash
nano /etc/pve/lxc/200.conf
```

### Google Coral USB TPU

```conf
lxc.cgroup2.devices.allow: c 189:* rwm
lxc.mount.entry: /dev/bus/usb dev/bus/usb none bind,optional,create=dir
```

### Intel iGPU (VAAPI / Quick Sync)

```conf
lxc.cgroup2.devices.allow: c 226:* rwm
lxc.mount.entry: /dev/dri dev/dri none bind,optional,create=dir
```

Redémarre le conteneur après modification :

```bash
pct stop 200 && pct start 200
```

---

## Étape 3 : Installer Docker

Entre dans le conteneur :

```bash
pct enter 200
```

Installe Docker :

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg git nodejs npm nginx

# Clé GPG Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Dépôt Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Vérification
docker --version
docker compose version
```

Node.js 20 si la version installée est trop ancienne (< 18) :

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

---

## Étape 4 : Préparer la structure des dossiers

```bash
mkdir -p /opt/frigate/{config,storage,ssl}
```

---

## Étape 5 : Configurer Frigate

```bash
cat > /opt/frigate/config/config.yml << 'EOF'
mqtt:
  enabled: false
  # host: 192.168.1.100
  # port: 1883
  # user: mqtt_user
  # password: mqtt_password

detectors:
  cpu:
    type: cpu
  # Décommenter pour Coral USB :
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

# Accélération matérielle ffmpeg (décommenter selon ton matériel) :
# ffmpeg:
#   hwaccel_args: preset-vaapi    # Intel iGPU
#   hwaccel_args: preset-nvidia   # NVIDIA
EOF
```

Adapte les caméras :

```bash
nano /opt/frigate/config/config.yml
```

---

## Étape 6 : Déployer avec Docker Compose + Nginx HTTPS

```bash
cat > /opt/frigate/docker-compose.yml << 'EOF'
services:
  frigate:
    container_name: frigate
    image: ghcr.io/blakeblackshear/frigate:stable
    restart: unless-stopped
    privileged: true
    shm_size: "256mb"
    # Frigate n'est plus exposé directement — Nginx fait le proxy HTTPS
    expose:
      - "5000"
    ports:
      - "8554:8554"       # RTSP restream
      - "8555:8555"       # WebRTC (TCP)
      - "8555:8555/udp"   # WebRTC (UDP)
    volumes:
      - /etc/localtime:/etc/localtime:ro
      - ./config:/config
      - ./storage:/media/frigate
      # Frontend modernisé (après le build)
      - /opt/frigate-src/web/dist:/opt/frigate/frigate/dist:ro
    environment:
      - FRIGATE_RTSP_PASSWORD=changeme
    # Décommenter pour Coral USB TPU :
    # devices:
    #   - /dev/bus/usb:/dev/bus/usb
    # Décommenter pour Intel iGPU :
    # devices:
    #   - /dev/dri/renderD128:/dev/dri/renderD128
    networks:
      - frigate_net

  nginx:
    container_name: frigate-nginx
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - frigate
    networks:
      - frigate_net

networks:
  frigate_net:
    driver: bridge
EOF
```

> **shm_size** selon le nombre de caméras :
>
> | Caméras | shm_size |
> |---------|----------|
> | 1–3     | 128mb    |
> | 4–6     | 256mb    |
> | 7–12    | 512mb    |
> | 12+     | 1gb      |

---

## Étape 7 : Configurer Nginx (HTTPS)

### Générer le certificat auto-signé

```bash
mkdir -p /opt/frigate/nginx/ssl

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /opt/frigate/nginx/ssl/frigate.key \
  -out /opt/frigate/nginx/ssl/frigate.crt \
  -subj "/C=FR/ST=Local/L=Local/O=Frigate/CN=frigate.local"
```

### Créer la configuration Nginx

```bash
mkdir -p /opt/frigate/nginx

cat > /opt/frigate/nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    # Redirection HTTP → HTTPS
    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl;
        server_name _;

        ssl_certificate     /etc/nginx/ssl/frigate.crt;
        ssl_certificate_key /etc/nginx/ssl/frigate.key;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;

        # Taille max pour les exports vidéo
        client_max_body_size 0;

        # Interface Web + API
        location / {
            proxy_pass         http://frigate:5000;
            proxy_http_version 1.1;
            proxy_set_header   Upgrade $http_upgrade;
            proxy_set_header   Connection "upgrade";
            proxy_set_header   Host $host;
            proxy_set_header   X-Real-IP $remote_addr;
            proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto https;
            proxy_read_timeout 3600;
        }
    }
}
EOF
```

---

## Étape 8 : Builder le frontend modernisé

```bash
cd /opt
git clone https://github.com/Exrahn/FrigateNVR.git frigate-src
cd frigate-src
git checkout frontend-modernization
cd web
npm install

# Augmenter la mémoire Node.js pour le build
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
# → génère /opt/frigate-src/web/dist/
```

---

## Étape 9 : Démarrer et vérifier

```bash
cd /opt/frigate
docker compose up -d
```

Vérifier les logs :

```bash
docker compose logs -f
```

Trouver l'IP du conteneur :

```bash
hostname -I
```

Accéder à l'interface :

```
https://<IP_DU_CT>
```

> Le navigateur affichera un avertissement pour le certificat auto-signé → cliquer **Avancer quand même**.

### Importer le certificat (optionnel, pour éviter l'avertissement)

Récupère le fichier `/opt/frigate/nginx/ssl/frigate.crt` et importe-le comme autorité de confiance :

| Plateforme  | Procédure |
|-------------|-----------|
| **Windows** | `certmgr.msc` → Autorités de certification racines de confiance → Importer |
| **macOS**   | Trousseau d'accès → Système → Importer, puis définir comme "Toujours approuver" |
| **Android** | Paramètres → Sécurité → Certificats → Installer |
| **iPhone**  | Envoyer le `.crt` par mail → Installer → Réglages → Général → À propos → Certificats |

---

## Maintenance

### Mise à jour de Frigate

```bash
cd /opt/frigate
docker compose pull
docker compose up -d
```

### Mise à jour du frontend

```bash
cd /opt/frigate-src
git pull
cd web
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
docker compose restart nginx
```

### Voir les logs

```bash
# Tous les services
docker compose -f /opt/frigate/docker-compose.yml logs -f

# Frigate uniquement
docker compose -f /opt/frigate/docker-compose.yml logs -f frigate

# Nginx uniquement
docker compose -f /opt/frigate/docker-compose.yml logs -f nginx
```

### Sauvegarde

```bash
# Configuration
cp -r /opt/frigate/config /root/frigate-config-backup

# Certificat SSL
cp -r /opt/frigate/nginx/ssl /root/frigate-ssl-backup
```

### Surveiller les ressources

```bash
docker stats
```

---

## Dépannage

### Le conteneur ne démarre pas / erreur Docker

Vérifier que le **nesting** est activé :

```bash
# Sur le host Proxmox
pct set 200 --features nesting=1
pct stop 200 && pct start 200
```

### Erreur "heap out of memory" pendant le build

```bash
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

Si ça persiste, augmenter la RAM du CT depuis le host :

```bash
pct set 200 --memory 8192
pct reboot 200
```

### Permission refusée pour /dev/dri ou /dev/bus/usb

- Vérifier que le conteneur est **privilégié** (non unprivileged)
- Vérifier les lignes `lxc.cgroup2.devices.allow` dans `/etc/pve/lxc/200.conf`

### CPU élevé

- Activer l'accélération matérielle dans `config.yml` (`ffmpeg.hwaccel_args`)
- Réduire `detect.fps` à 3–5 fps
- Ajouter un Coral TPU pour délester la détection

### Espace disque saturé

```bash
# Voir l'utilisation
du -sh /opt/frigate/storage/

# Ajuster la rétention dans config.yml
# record.retain.days: 3
# record.retain.mode: motion
```

---

## Architecture finale

```
Proxmox Host
└── LXC Container (CT 200 — Debian 12, 6 Go RAM)
    ├── Docker Engine
    │   ├── frigate (ghcr.io/blakeblackshear/frigate:stable)
    │   │   ├── Port interne 5000  → API + UI
    │   │   ├── Port 8554          → RTSP restream
    │   │   └── Port 8555          → WebRTC
    │   │
    │   └── frigate-nginx (nginx:alpine)
    │       ├── Port 80   → Redirection HTTPS
    │       └── Port 443  → Interface Web (HTTPS)
    │
    ├── /opt/frigate/
    │   ├── config/config.yml      → Configuration Frigate
    │   ├── storage/               → Enregistrements & snapshots
    │   ├── nginx/nginx.conf       → Configuration Nginx
    │   └── nginx/ssl/             → Certificat auto-signé
    │
    └── /opt/frigate-src/web/dist/ → Frontend React modernisé
```

---

## Liens utiles

- [Documentation Frigate](https://docs.frigate.video)
- [Installation Docker Frigate](https://docs.frigate.video/frigate/installation)
- [Documentation LXC Proxmox](https://pve.proxmox.com/wiki/Linux_Container)
- [Guide accélération matérielle](https://docs.frigate.video/configuration/hardware_acceleration)
