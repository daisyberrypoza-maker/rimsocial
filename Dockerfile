# Build from the repository root so both workspaces are available.
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Install workspace dependencies from the monorepo root.
COPY package.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm install --include=dev

# Copy application source only after dependency installation for better layer caching.
COPY backend ./backend
COPY frontend ./frontend

# Vite is a build-time dependency and is included above.
RUN npm run build

ENV SERVE_FRONTEND=true
EXPOSE 3000

CMD ["npm", "start"]
