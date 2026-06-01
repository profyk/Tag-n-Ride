const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
  },
  // Include company-docs from the monorepo root in Vercel's output file tracing
  // so the /api/documents routes can read them at runtime.
  experimental: {
    outputFileTracingRoot: path.join(__dirname, ".."),
    outputFileTracingIncludes: {
      "/api/documents": ["../company-docs/**/*.md"],
      "/api/documents/content": ["../company-docs/**/*.md"],
    },
  },
};

module.exports = nextConfig;
