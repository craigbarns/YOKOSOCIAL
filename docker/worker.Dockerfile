FROM mcr.microsoft.com/playwright:v1.62.1-noble AS base

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json turbo.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN npm install

COPY apps/worker apps/worker
RUN npm run db:generate && npm run build --workspace @yokosocial/worker

USER pwuser
CMD ["npm", "run", "start", "--workspace", "@yokosocial/worker"]
