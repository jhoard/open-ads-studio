import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SDK hashes uploads with WebAssembly; keep it out of the server bundle.
  serverExternalPackages: ["@comfyorg/sdk"],
  // API routes read /workflows/*.json and the brand, product and font assets and the example renders at runtime, so ship them with the functions.
  outputFileTracingIncludes: { "/api/**": ["./workflows/**", "./assets/**", "./public/examples/**"] },
};

export default nextConfig;
