import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the prebuilt vector index with the chat API function on Vercel.
  outputFileTracingIncludes: {
    "/api/chat": ["./data/index.json"],
  },
};

export default nextConfig;
