import type { NextConfig } from "next";

// This file configures Next.js itself — separate from your app's own code.
// The one thing we need it for right now is the "rewrites" function below.

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],

  async rewrites() {
    return {
      // "beforeFiles" means: check these rules BEFORE Next.js looks at its
      // own file-based routes (like app/page.tsx). Without "beforeFiles",
      // Next would render app/page.tsx for "/" and never reach this rule.
      beforeFiles: [
        {
          source: "/",
          destination: "/Hirely_Landing_Page.html",
        },
      ],
    };
  },
};

export default nextConfig;