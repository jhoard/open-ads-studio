import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  turbopack: { root: path.resolve(process.cwd(), "../..") },
  outputFileTracingIncludes: { "/api/plugin": ["./plugin/**"] },
};
export default config;
