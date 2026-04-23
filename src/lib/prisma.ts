import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

function createPrismaClient() {
  const rawUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  // Strip "file:" prefix to get the filesystem path
  const dbPath = rawUrl.startsWith("file:")
    ? rawUrl.slice(5)
    : path.join(process.cwd(), "prisma", "dev.db");

  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
