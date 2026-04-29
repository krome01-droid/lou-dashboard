# ============================================
# LOU Dashboard — Dockerfile (Hostinger VPS)
# Next.js 16 — standalone output
# ============================================
FROM node:22-alpine AS base

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Next.js standalone bundle (includes its own server)
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3847/api/auth/session || exit 1

EXPOSE 3847
ENV PORT=3847
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
