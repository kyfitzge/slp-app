/**
 * One-time script: delete all seed GoalDataPoint records from the database.
 * Run with: npx tsx prisma/delete-seed-datapoints.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"]! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const deleted = await prisma.goalDataPoint.deleteMany({
    where: { id: { startsWith: "seed-dp-" } },
  });
  console.log(`Deleted ${deleted.count} seed data points.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
