import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  allowedDevOrigins: [
    "swfrom-ip-186-81-100-226.tunnelmole.net",
    "lu3q6v-ip-186-81-100-226.tunnelmole.net",
    "*.tunnelmole.net",
  ],
};

export default nextConfig;
