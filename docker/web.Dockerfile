# cache-bust: v2
FROM node:22-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages packages
RUN npm install

FROM dependencies AS builder
COPY . .
RUN npx turbo run build --filter=@yokosocial/web...

FROM node:22-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node --from=builder /app/apps/web/.next/standalone ./
COPY --chown=node:node --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node --from=builder /app/apps/web/public ./apps/web/public
COPY --chown=node:node --from=builder /app/packages/database ./packages/database
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
USER node
CMD ["sh", "-c", "echo 'Running prisma db push...' && npx prisma db push --schema=packages/database/prisma/schema.prisma --accept-data-loss && echo 'DB push complete! Starting server...' && node apps/web/server.js"]

