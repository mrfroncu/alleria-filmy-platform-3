# GPU-capable base — Ubuntu, not Alpine, is required for NVENC: Alpine's ffmpeg package has
# no nvenc encoders at all, and its musl libc doesn't work well with the NVIDIA Container
# Toolkit's driver injection (which expects glibc). The nvidia/cuda image is plain Ubuntu
# 22.04 plus the CUDA *runtime* libraries — actual GPU access still comes entirely from the
# host's NVIDIA driver, injected into the container at startup by the NVIDIA Container
# Toolkit (add `runtime: nvidia` to docker-compose.yml's streaming service); nothing in this
# image hardcodes a GPU, and it runs fine without one (STREAM_USE_GPU unset/false).
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

# Ubuntu's ffmpeg package (unlike Alpine's) is built with h264_nvenc/hevc_nvenc support.
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl gnupg ca-certificates ffmpeg && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server.js versions.js ./
RUN mkdir -p /data/media /data/keys /data/uploads
EXPOSE 4000
CMD ["node", "server.js"]
