# Déploiement Frigate NVR sur Proxmox (LXC + Docker)

Guide complet pour déployer Frigate NVR avec le frontend modernisé dans un conteneur LXC Proxmox via Docker.

## Prérequis

- Proxmox VE 7.x ou 8.x
- Template Debian 12 (Bookworm) téléchargé dans Proxmox
- Accès réseau (RTSP caméras sur le même réseau)

## 1. Créer le conteneur LXC

### Via l'interface Proxmox

1. **Datacenter** → **Create CT**
2. Configuration recommandée :

| Paramètre | Valeur |
|---|---|
| **OS** | Debian 12 (Bookworm) |
| **CPU** | 4 cores minimum |
| **RAM** | 4 Go minimum (6 Go recommandé) |
| **Stockage** | 32 Go minimum (+ stockage pour enregistrements) |
| **Réseau** | Bridge `vmbr0`, IP statique recommandée |

3. Dans les **Options** du CT, activer :
   - ☑️ **Nesting** (`nesting=1`) — requis pour Docker dans LXC
   - ☑️ **Privileged** (`unprivileged=0`) — recommandé pour l'accès matériel

### Via CLI Proxmox

```bash
pct create 200 local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst \
  --hostname frigate \
  --cores 4 \
  --memory 6144 \
  --swap 2048 \
  --rootfs local-lvm:32 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.124/24,gw=192.168.1.1 \
  --features nesting=1 \
  --unprivileged 0 \
  --start 1
```

> **Note :** Ajustez l'IP, la gateway et la taille du stockage selon votre réseau.

### Configuration LXC pour l'accès GPU (optionnel)

Si vous avez un iGPU Intel pour l'accélération matérielle, ajoutez au fichier `/etc/pve/lxc/<ID>.conf` :

```
lxc.cgroup2.devices.allow: c 226:128 rwm
lxc.mount.entry: /dev/dri/renderD128 dev/dri/renderD128 none bind,optional,create=file
```

## 2. Installation de Docker

Connectez-vous au CT :

```bash
pct enter 200
```

Installer Docker :

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg lsb-release

# Ajouter le dépôt Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(lsb_release -cs) stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Vérifier :

```bash
docker --version
docker compose version
```

## 3. Préparer les répertoires

```bash
mkdir -p /opt/frigate/{config,media,nginx/ssl}
```

| Répertoire | Usage |
|---|---|
| `/opt/frigate/config` | Configuration Frigate (`config.yml`) |
| `/opt/frigate/media` | Enregistrements, clips, exports (**persistant hors Docker**) |
| `/opt/frigate/nginx/ssl` | Certificats SSL pour le reverse proxy |

## 4. Configuration de Frigate

Créer `/opt/frigate/config/config.yml` :

```yaml
mqtt:
  enabled: false

cameras:
  salon:
    enabled: true
    ffmpeg:
      inputs:
        - path: rtsp://user:password@192.168.1.X:554/stream1
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

detectors:
  cpu:
    type: cpu

auth:
  trusted_proxies:
    - 172.16.0.0/12
```

> **⚠️ Mot de passe RTSP :** Si le mot de passe contient des caractères spéciaux (`!`, `@`, `#`...), utilisez l'encodage URL (ex: `!` → `%21`). Alternativement, configurez **go2rtc** comme intermédiaire (voir section avancée).

## 5. Certificats SSL

Générer un certificat auto-signé :

```bash
openssl req -x509 -nodes -days 3650 \
  -newkey rsa:2048 \
  -keyout /opt/frigate/nginx/ssl/frigate.key \
  -out /opt/frigate/nginx/ssl/frigate.crt \
  -subj "/CN=frigate.local"
```

## 6. Configuration Nginx (reverse proxy HTTPS)

Créer `/opt/frigate/nginx/nginx.conf` :

```nginx
events { worker_connections 1024; }

http {
    upstream frigate {
        server frigate:8971;
    }

    server {
        listen 443 ssl;
        server_name _;

        ssl_certificate     /etc/nginx/ssl/frigate.crt;
        ssl_certificate_key /etc/nginx/ssl/frigate.key;

        # Transmet l'IP réelle pour le rate limiting de Frigate
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;

        location / {
            proxy_pass https://frigate;
            proxy_ssl_verify off;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_buffering off;
        }
    }
}
```

> **Important :** Le port `8971` de Frigate écoute en **HTTPS** nativement. Le `proxy_pass` doit utiliser `https://` et `proxy_ssl_verify off` (certificat interne auto-signé).

## 7. Docker Compose

Créer `/opt/frigate/docker-compose.yml` :

```yaml
services:
  frigate:
    container_name: frigate
    image: ghcr.io/blakeblackshear/frigate:0.17.0
    restart: unless-stopped
    shm_size: "256mb"
    ports:
      - "5000:5000"
      - "8971:8971"
      - "8554:8554"
      - "8555:8555/tcp"
      - "8555:8555/udp"
    volumes:
      - /opt/frigate/config:/config
      - /opt/frigate/media:/media/frigate
      - /etc/localtime:/etc/localtime:ro
    tmpfs:
      - /tmp/cache:size=512m
    environment:
      FRIGATE_RTSP_PASSWORD: "password"

  nginx:
    container_name: nginx
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "443:443"
    volumes:
      - /opt/frigate/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /opt/frigate/nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - frigate
```

### Description des ports

| Port | Usage |
|---|---|
| `5000` | Interface web interne (non authentifiée) |
| `8971` | Interface web authentifiée (utilisé par le reverse proxy) |
| `8554` | Serveur RTSP (restream go2rtc) |
| `8555` | Serveur WebRTC |
| `443` | HTTPS via nginx |

## 8. Démarrage

```bash
cd /opt/frigate
docker compose up -d
```

Vérifier que les conteneurs fonctionnent :

```bash
docker compose ps
docker logs frigate 2>&1 | head -50
```

### Récupérer le mot de passe admin

Au premier démarrage, Frigate génère un mot de passe admin :

```bash
docker logs frigate 2>&1 | grep -i password
```

Notez ce mot de passe, puis connectez-vous à `https://<IP_DU_CT>` pour accéder à la page de login.

## 9. Accès à l'interface

| URL | Description |
|---|---|
| `https://192.168.1.124` | Via nginx (authentifié, recommandé) |
| `http://192.168.1.124:5000` | Accès direct (non authentifié, réseau local uniquement) |
| `http://192.168.1.124:8971` | Accès direct authentifié (HTTPS natif Frigate) |

## 10. Stockage persistant des enregistrements

Les enregistrements sont stockés dans `/opt/frigate/media/` sur le CT hôte, **en dehors du conteneur Docker**. Ils persistent même si le conteneur est supprimé ou recréé.

Structure des fichiers :

```
/opt/frigate/media/
├── recordings/     # Enregistrements vidéo (YYYY-MM-DD/HH/camera/MM.SS.mp4)
├── clips/          # Snapshots d'événements
└── exports/        # Clips et timelapses exportés
```

### Utiliser un stockage externe (NAS, disque supplémentaire)

Pour stocker les enregistrements sur un NAS ou un disque externe :

```bash
# Monter un partage NFS
apt install -y nfs-common
mount -t nfs 192.168.1.X:/share/frigate /opt/frigate/media

# Rendre permanent dans /etc/fstab
echo "192.168.1.X:/share/frigate /opt/frigate/media nfs defaults 0 0" >> /etc/fstab
```

> **⚠️** Un SSD local est recommandé pour les performances. Un NAS via réseau nécessite une connexion Gigabit fiable.

## Mise à jour

### Mise à jour de Frigate

```bash
cd /opt/frigate
docker compose pull frigate
docker compose up -d
```

### Mise à jour du frontend personnalisé

Si vous utilisez le frontend modernisé depuis ce dépôt :

```bash
# Cloner/mettre à jour le dépôt source
cd /opt/frigate-src
git pull origin frontend-modernization

# Reconstruire le frontend
cd web
npm install
npm run build

# Déployer
cp -r dist/* /opt/frigate/web/

# Redémarrer Frigate
docker compose -f /opt/frigate/docker-compose.yml restart frigate
```

> **Note :** Pour le frontend personnalisé, ajoutez ce volume au service frigate dans `docker-compose.yml` :
> ```yaml
> volumes:
>   - /opt/frigate/web:/opt/frigate/web
> ```

## Configuration avancée : go2rtc (recommandé)

go2rtc est intégré à Frigate et permet de gérer les flux RTSP de manière plus fiable, notamment pour les caméras avec des mots de passe complexes.

Ajouter dans `config.yml` :

```yaml
go2rtc:
  streams:
    salon:
      - rtsp://user:password@192.168.1.X:554/stream1

cameras:
  salon:
    enabled: true
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/salon
          roles:
            - detect
            - record
```

Avantages :
- Frigate se connecte à go2rtc en local (pas de problèmes d'encodage de mot de passe)
- go2rtc gère la reconnexion automatique à la caméra
- Permet le WebRTC pour un affichage en temps réel avec latence minimale

## Dépannage

### Frigate ne démarre pas

```bash
docker logs frigate 2>&1 | tail -30
```

### Erreur 401 Unauthorized sur le flux RTSP

- Vérifier les identifiants de la caméra
- Si le mot de passe contient `!`, `@`, `#`, etc., utiliser go2rtc comme intermédiaire
- La caméra peut bloquer temporairement les connexions après trop de tentatives échouées → redémarrer la caméra

### Erreur 400 Bad Request (nginx)

Le port 8971 de Frigate utilise HTTPS nativement. Assurez-vous que `proxy_pass` utilise `https://` :

```nginx
proxy_pass https://frigate;
proxy_ssl_verify off;
```

### Le frontend personnalisé ne s'affiche pas

Vérifier que le volume est monté :

```yaml
volumes:
  - /opt/frigate/web:/opt/frigate/web
```

Puis vérifier que les fichiers sont présents :

```bash
ls -la /opt/frigate/web/
# Doit contenir index.html, assets/, etc.
```
