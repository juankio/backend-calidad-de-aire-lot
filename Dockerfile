# ==============================================================================
# 🍳 Air Guardian IoT Backend - Production Dockerfile (Bun + NestJS + SQLite WAL)
# Chef: Sanji - Backend Architecture & Security
# Multi-Stage Build Optimizado para Railway / Render / Fly.io
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Dependencias de Producción (Lean Cache Layer)
# ------------------------------------------------------------------------------
FROM oven/bun:1-slim AS deps
WORKDIR /app

# Copiar manifiestos de dependencias
COPY package.json bun.lock* ./

# Instalar dependencias estrictas de producción
RUN bun install --frozen-lockfile --production

# ------------------------------------------------------------------------------
# Stage 2: Verificación de Tipos y Control de Calidad (Zero-Defect Build)
# ------------------------------------------------------------------------------
FROM oven/bun:1-slim AS builder
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

# Validar TypeScript y compilar antes de empaquetar
RUN bun run build

# ------------------------------------------------------------------------------
# Stage 3: Runner de Producción
# ------------------------------------------------------------------------------
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002
ENV DATABASE_PATH=/app/data/air_guardian_datalake.sqlite

# Crear directorio persistente para el Data Lakehouse Medallion (Bronze/Silver/Gold)
# y asignar permisos al usuario no-root 'bun'
RUN mkdir -p /app/data && chown -R bun:bun /app

# Copiar dependencias de producción y artefactos
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json bun.lock* tsconfig.json ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun index.ts ./

# Volumen persistente para SQLite y archivos WAL/SHM
VOLUME ["/app/data"]

# Ejecutar como usuario no-root por seguridad
USER bun

# Puerto de servicio de la API y WebSockets
EXPOSE 3002

# Healthcheck para orquestadores en la nube
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3002/api/simulate/status').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Comando de inicio del servidor NestJS con Bun
CMD ["bun", "run", "start"]
