FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# sqlite3 CLI: required by scripts/backup-db.sh for .backup when WAL is active (better-sqlite3 default).
# bash: npm run backup:db invokes bash ./scripts/backup-db.sh
RUN apk add --no-cache python3 make g++ sqlite3 bash
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder /app/scripts ./scripts
VOLUME /app/data
EXPOSE 3000
CMD ["node", "server.js"]
