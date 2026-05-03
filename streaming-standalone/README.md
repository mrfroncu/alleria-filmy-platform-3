# Alleria Streaming — Standalone Deployment

Deploy the video streaming/transcoding service on a separate server (e.g. via Tailscale).

All required source files (`server.js`, `package.json`, `versions.js`) are included in this folder.

## Setup

1. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env — set STREAM_SECRET to match main app
   ```

2. Build and start:
   ```bash
   docker compose up -d --build
   ```

3. On the **main app server**, update `.env`:
   ```env
   STREAM_URL=http://<this-server-tailscale-ip>:4000
   ```

4. Rebuild main app:
   ```bash
   docker compose up -d --build
   ```

## Custom Storage Path

To store videos on a specific mount point, edit `docker-compose.yml`:

```yaml
volumes:
  - /mnt/storage/alleria-streaming:/data
```

Or set env vars for granular control:
```env
STREAM_MEDIA_DIR=/data/media
STREAM_KEYS_DIR=/data/keys
STREAM_UPLOAD_DIR=/data/uploads
```
