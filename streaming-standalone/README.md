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

To store videos on a specific mount point, set it in **`.env`** — never edit the `volumes:` line
in `docker-compose.yml` directly. That file gets re-copied on updates (step 1 above), which would
silently reset the mount back to the plain `stream-data` Docker volume: the container would then
see an empty library while your actual videos stay untouched but orphaned at the old host path.

```env
STREAM_HOST_DATA_DIR=/mnt/storage/alleria-streaming
```

`docker-compose.yml` already reads this var (`${STREAM_HOST_DATA_DIR:-stream-data}:/data`), so a
plain `docker compose up -d` picks it up — no compose file edit needed.

For reorganizing the layout *inside* the container (rarely needed, and does not by itself affect
what's persisted on the host — that's controlled by `STREAM_HOST_DATA_DIR` above):
```env
STREAM_DATA_DIR=/data
STREAM_MEDIA_DIR=/data/media
STREAM_KEYS_DIR=/data/keys
STREAM_UPLOAD_DIR=/data/uploads
```
