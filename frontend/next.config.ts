import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.1.68", "192.168.56.1", "localhost", "127.0.0.1"],
};

export default nextConfig;
