import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config(); // fallback to .env
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Use the pooled connection URL for Prisma Client queries (port 6543 for Supabase)
    url: process.env["DATABASE_URL"],
    // Use the direct connection URL for migrations (port 5432 for Supabase)
    directUrl: process.env["DIRECT_URL"],
  },
});
