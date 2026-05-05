# Seneschal

A Next.js application for tabletop RPG game masters. Manages campaigns, random tables, NPC generation, calendar tracking, dungeon exploration, and combat encounters. Designed for local network use.

## Setup

### Prerequisites

- Node.js 20+
- npm

### First-time setup

```bash
git clone https://github.com/billykalb/Seneschal.git
cd Seneschal
npm install
npx prisma generate
```

Create a `.env` file in the project root:

```
DATABASE_URL="file:./dev.db"
BETTER_AUTH_SECRET="your-long-random-secret"
BETTER_AUTH_URL="http://<host-ip>:3000"
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
