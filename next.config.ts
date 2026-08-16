import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's engine is a native binary; keep it out of the bundler.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  images: {
    // Product art currently lives on Framer's CDN. Add the client's own bucket
    // here when uploads move in-house.
    remotePatterns: [
      { protocol: "https", hostname: "framerusercontent.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
};

export default nextConfig;
