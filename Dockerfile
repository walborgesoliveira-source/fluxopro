FROM node:20-alpine AS builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine

WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --production

COPY backend/src ./src
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 3000

# Init DB then start
CMD ["sh", "-c", "node src/database/init.js && node src/server.js"]
