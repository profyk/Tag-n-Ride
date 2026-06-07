const path = require("path");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com https://staticmap.openstreetmap.de https://maps.googleapis.com https://maps.gstatic.com",
      "font-src 'self' data:",
      "connect-src 'self' https://tag-n-ride-production.up.railway.app",
      "frame-src https://www.google.com https://maps.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["res.cloudinary.com"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
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
