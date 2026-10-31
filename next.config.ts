import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SDK hashes uploads with WebAssembly; keep it out of the server bundle.
  serverExternalPackages: ["@comfyorg/sdk", "playwright-core", "@sparticuz/chromium", "@ffmpeg-installer/ffmpeg", "@ffprobe-installer/ffprobe"],
  // API routes read /workflows/*.json and the brand, product and font assets and the example renders at runtime, so ship them with the functions.
  outputFileTracingIncludes: {
    "/api/**": ["./workflows/**", "./assets/**", "./public/examples/**"],
    // The serverless Chromium binary ships as brotli files the package unpacks at launch.
    "/api/brand": ["./node_modules/@sparticuz/chromium/bin/**"],
    // Clip post-steps and exports run ffmpeg: the static Linux builds the installers resolve on Vercel.
    "/api/jobs/**": ["./node_modules/@ffmpeg-installer/linux-x64/**", "./node_modules/@ffprobe-installer/linux-x64/**"],
    "/api/export": ["./node_modules/@ffmpeg-installer/linux-x64/**", "./node_modules/@ffprobe-installer/linux-x64/**"],
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
