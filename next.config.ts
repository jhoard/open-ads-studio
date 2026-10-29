import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SDK hashes uploads with WebAssembly; keep it out of the server bundle.
  serverExternalPackages: ["@comfyorg/sdk"],
  // API routes read /workflows/*.json at runtime, so ship them with the functions.
  outputFileTracingIncludes: { "/api/**": ["./workflows/**"] },
};

export default nextConfig;
