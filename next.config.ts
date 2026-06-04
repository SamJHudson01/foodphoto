import type { NextConfig } from "next";

const r2ImageOrigin = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL
  ? new URL(process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL).origin
  : "https://*.r2.cloudflarestorage.com";

const clerkConnectSources = [
  "https://*.clerk.accounts.dev",
  "https://*.clerk.dev",
  "https://*.clerk.com",
  "https://api.clerk.com"
].join(" ");

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' blob: data: https: " + r2ImageOrigin,
  "media-src 'self' blob:",
  "connect-src 'self' " + clerkConnectSources + " " + r2ImageOrigin,
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  "form-action 'self' https://*.clerk.accounts.dev https://*.clerk.dev https://*.clerk.com"
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
