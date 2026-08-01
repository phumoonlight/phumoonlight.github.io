import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Emit a fully static site into out/ — no server, no API routes, no ISR.
  // .github/workflows/deploy.yml uploads that directory straight to Pages.
  output: 'export',

  // GitHub Pages has no image optimizer, so next/image must serve files as-is.
  images: { unoptimized: true },

  // /about -> /about/index.html, so Pages resolves routes without a rewrite layer.
  trailingSlash: true,
}

export default nextConfig
