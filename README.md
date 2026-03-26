This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Database Backups (Coolify Cron)

This app uses SQLite (`DATABASE_PATH`, default `./data/budget.db`). A daily backup script is available for production cron jobs:

```bash
npm run backup:db
```

### Environment variables

- `DATABASE_PATH` (optional): SQLite file path. Default: `./data/budget.db`
- `BACKUP_DIR` (optional): backup output folder. Default: `./data/backups`
- `BACKUP_RETENTION_DAYS` (optional): backup retention in days. Default: `30`
- `BACKUP_COMPRESS` (optional): `1|true|yes` to gzip backups (default `1`)

### Coolify setup

1. Ensure your database and backup directories are in persistent storage (volume mount).
2. Add a cron job in Coolify with:
   - Schedule: `0 2 * * *` (example daily at 02:00 UTC/server time)
   - Command: `npm run backup:db`
3. Check Coolify cron logs for `Backup created: ...` and alert on non-zero exits.

### Safety notes

- The script uses `sqlite3 .backup` when the `sqlite3` CLI is available, which is safe for live SQLite databases.
- If `sqlite3` is not available, it falls back to file copy only when no active WAL file is detected.
- If WAL is active and `sqlite3` CLI is missing, the script fails intentionally to avoid potentially inconsistent backups.

### Restore steps

1. Stop the app process.
2. Keep a copy of the current DB file.
3. Restore one backup file:
   - Compressed backup:
     ```bash
     gunzip -c ./data/backups/budget-YYYYMMDD-HHMMSS.db.gz > ./data/budget.db
     ```
   - Uncompressed backup:
     ```bash
     cp ./data/backups/budget-YYYYMMDD-HHMMSS.db ./data/budget.db
     ```
4. Start the app and verify key pages/queries.
