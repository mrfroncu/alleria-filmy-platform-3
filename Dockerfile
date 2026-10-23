# ===== Stage 1: Build frontend =====
FROM node:26-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ===== Stage 2: Production =====
FROM node:26-alpine AS production
WORKDIR /app

# Pick up Alpine security fixes released after the base image was published
RUN apk upgrade --no-cache

# Install backend dependencies, then drop npm/npx/corepack: the app runs with plain `node`, and
# npm's bundled packages (tar, undici, brace-expansion, ...) only add CVEs to the runtime image.
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data directory
RUN mkdir -p /app/backend/data/uploads

# Expose port
EXPOSE 3000

# Set working directory to backend
WORKDIR /app/backend

CMD ["node", "server.js"]
