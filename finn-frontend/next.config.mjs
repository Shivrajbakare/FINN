import { resolveApiBase } from "./src/lib/api-config.mjs";

// NEXT_PUBLIC_* is frozen into the browser bundle at build time.
resolveApiBase(process.env.NEXT_PUBLIC_API_URL, process.env.NODE_ENV === "production");

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
