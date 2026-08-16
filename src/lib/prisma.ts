import { PrismaClient } from "@prisma/client";

// Dev hot-reload re-evaluates this module on every edit; without the global the
// old clients keep their connections and Postgres runs out of slots.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
