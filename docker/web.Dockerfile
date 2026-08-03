FROM node:22-slim AS dependencies
WORKDIR /app
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
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node --from=builder /app/apps/web/.next/standalone ./
COPY --chown=node:node --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node --from=builder /app/apps/web/public ./apps/web/public
COPY --chown=node:node --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --chown=node:node --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --chown=node:node --from=builder /app/node_modules/@prisma ./node_modules/@prisma
USER node
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --schema=packages/database/prisma/schema.prisma && node apps/web/server.js"]
