import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/admin-lou",
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/signin",
        destination: "/login",
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
