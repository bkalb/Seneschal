# Seneschal

A Next.js application for tabletop RPG game masters. Manages campaigns, random tables, NPC generation, calendar tracking, dungeon exploration, and combat encounters. Designed for local network use.

## Setup

### Prerequisites

- Node.js 20+
- npm

### First-time setup

```bash
git clone https://github.com/bkalb/Seneschal.git
cd Seneschal
npm install
npx prisma generate
```

Create a `.env` file in the project root:

```
DATABASE_URL="file:./dev.db"
BETTER_AUTH_SECRET="your-long-random-secret"
BETTER_AUTH_URL="http://<host-ip>:3000"
NEXT_PUBLIC_APP_URL="http://<host-ip>:3000"
```

Run migrations to initialize the database:

```bash
npx prisma migrate deploy
```

### Running the app

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm run start
```

Open `http://<host>:3000` in your browser.

## Production configuration

### Environment variables

For a production deployment behind a reverse proxy (e.g. Nginx Proxy Manager):

```
DATABASE_URL="file:/var/lib/seneschal/seneschal.db"
BETTER_AUTH_SECRET="your-long-random-secret"
BETTER_AUTH_URL="https://your-domain.com"
NEXT_PUBLIC_APP_URL="https://your-domain.com"
```

`BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` must match the public-facing URL the browser uses, including the correct scheme (`https://` if TLS is terminated by the proxy). `NEXT_PUBLIC_APP_URL` is embedded at build time — rebuild the app after changing it.

### Database

Avoid using `file:./dev.db` in production. Store the database outside the project directory so it is not affected by deploys:

```bash
mkdir -p /var/lib/seneschal
```

Set `DATABASE_URL="file:/var/lib/seneschal/seneschal.db"` in `.env`, then run migrations:

```bash
npx prisma migrate deploy
```

If migrating an existing database from the default location:

```bash
cp /path/to/Seneschal/dev.db /var/lib/seneschal/seneschal.db
```

## Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

**Database:**
```bash
npx prisma migrate dev     # Apply migrations (dev)
npx prisma migrate deploy  # Apply migrations (production)
npx prisma generate        # Regenerate Prisma client after schema changes
npx prisma studio          # Open Prisma Studio UI
```
