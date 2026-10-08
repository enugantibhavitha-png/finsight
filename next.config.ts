import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the prebuilt vector index with the API functions on Vercel.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/index.json"],
    "/api/filings": ["./data/index.json"],
  },
};

export default nextConfig;
