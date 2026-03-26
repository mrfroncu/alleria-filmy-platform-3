FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server.js ./

RUN mkdir -p /data/media /data/keys /data/uploads

EXPOSE 4000

CMD ["node", "server.js"]
