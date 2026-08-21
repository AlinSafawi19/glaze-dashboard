import type { NextConfig } from "next";

/**
 * Uploaded artwork is served from this app's own origin (`/api/images/…`), so
 * it needs no entry here. Only artwork hosted elsewhere does: the client's
 * legacy Framer CDN images, and the bucket itself if it is ever made public.
 */
function externalImageHosts(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const patterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
    { protocol: "https", hostname: "framerusercontent.com" },
    { protocol: "https", hostname: "**.googleusercontent.com" },
    { protocol: "https", hostname: "storage.googleapis.com" },
  ];

  const publicBase = (process.env.STORAGE_PUBLIC_BASE_URL ?? "").trim();
  if (publicBase) {
    try {
      const { protocol, hostname } = new URL(publicBase);
      patterns.push({ protocol: protocol.replace(":", "") as "http" | "https", hostname });
    } catch {
      console.warn("[next.config] STORAGE_PUBLIC_BASE_URL is not a URL; ignoring it.");
    }
  }

  return patterns;
}

const nextConfig: NextConfig = {
  // Prisma's engine is a native binary; keep it out of the bundler.
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  images: {
    remotePatterns: externalImageHosts(),
  },
};

export default nextConfig;
