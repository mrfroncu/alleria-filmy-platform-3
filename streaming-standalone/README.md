# Alleria Streaming — Standalone Deployment

Deploy the video streaming/transcoding service on a separate server (e.g. via Tailscale).

## Setup

1. Copy required files into this folder:
   ```bash
   cp ../streaming/server.js ./
   cp ../streaming/package.json ./
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env — set STREAM_SECRET to match main app
   ```

3. Build and start:
   ```bash
   docker compose up -d --build
   ```

4. On the **main app server**, update `.env`:
   ```env
   STREAM_URL=http://<this-server-tailscale-ip>:4000
   ```

5. Rebuild main app:
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
