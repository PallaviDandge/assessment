import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared Zod contract is TypeScript source in the monorepo.
  transpilePackages: ["@cb/shared"],
  reactStrictMode: true,
};

export default nextConfig;
