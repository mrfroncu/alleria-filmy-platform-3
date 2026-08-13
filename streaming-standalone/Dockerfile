# Model used for offline transcription — override with `--build-arg WHISPER_MODEL=medium`.
ARG WHISPER_MODEL=small

# whisper.cpp build stage — compiles clean on Alpine/musl, kept separate so the build toolchain
# never ships in the final image.
FROM node:20-alpine AS whisper-builder
ARG WHISPER_MODEL
# The apk `wget` package (real GNU Wget) — Alpine's built-in BusyBox wget applet lacks --no-config,
# which download-ggml-model.sh below requires; without this it fails at model-download time.
RUN apk add --no-cache git build-base cmake bash wget
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git /whisper.cpp
WORKDIR /whisper.cpp
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release -j$(nproc)
RUN ./models/download-ggml-model.sh ${WHISPER_MODEL}

FROM node:20-alpine
ARG WHISPER_MODEL
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server.js versions.js ./
RUN mkdir -p /data/media /data/keys /data/uploads
# Binary is NOT rpath'd to its own directory (verified by actually running it) — libwhisper.so/
# libggml*.so must be found via LD_LIBRARY_PATH or every invocation fails to load.
COPY --from=whisper-builder /whisper.cpp/build/bin /opt/whisper/bin
COPY --from=whisper-builder /whisper.cpp/models/ggml-${WHISPER_MODEL}.bin /opt/whisper/model.bin
ENV WHISPER_BIN=/opt/whisper/bin/whisper-cli
ENV WHISPER_MODEL_PATH=/opt/whisper/model.bin
ENV LD_LIBRARY_PATH=/opt/whisper/bin
EXPOSE 4000
CMD ["node", "server.js"]
