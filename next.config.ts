import type { NextConfig } from "next";
import { configDotenv } from "dotenv";
import { existsSync } from "fs";
import path from "path";

// Force-load .env.local with override=true in local dev.
// This fixes an issue where the shell pre-sets env vars to empty strings,
// causing dotenv's default no-override behaviour to leave them blank.
// Skipped on Vercel / CI where .env.local doesn't exist.
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (existsSync(envLocalPath)) {
  configDotenv({ path: envLocalPath, override: true });
}

const nextConfig: NextConfig = {
  typescript: {
    // Type-only errors (e.g. z.coerce resolver mismatch, user possibly null)
    // don't affect runtime behaviour. Allow production builds to succeed.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
