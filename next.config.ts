import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SDK hashes uploads with WebAssembly; keep it out of the server bundle.
  serverExternalPackages: ["@comfyorg/sdk", "playwright-core", "@sparticuz/chromium"],
  // API routes read /workflows/*.json and the brand, product and font assets and the example renders at runtime, so ship them with the functions.
  outputFileTracingIncludes: {
    "/api/**": ["./workflows/**", "./assets/**", "./public/examples/**"],
    // The serverless Chromium binary ships as brotli files the package unpacks at launch.
    "/api/brand": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  // Example renders moved under /examples/directions; creatives saved in browsers still use the old paths.
  async redirects() {
    return [
      { source: "/examples/scene-slate.png", destination: "/examples/directions/slate-beam.png", permanent: true },
      { source: "/examples/scene-slate-raw.png", destination: "/examples/directions/slate-beam-raw.png", permanent: true },
    ];
  },
};

export default nextConfig;
