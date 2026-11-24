import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  experimental: { agentUpgrade: "security" },
  turbopack: { root: path.resolve(process.cwd(), "../..") },
  outputFileTracingIncludes: { "/api/plugin": ["./plugin/**"] },
};
export default config;
