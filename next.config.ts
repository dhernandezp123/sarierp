import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfjs-dist'],
  outputFileTracingIncludes: {
    '/api/manual-invoices/ocr': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/@napi-rs/canvas/**',
      './node_modules/@napi-rs/canvas-*/**',
    ],
  },
  images: {
    qualities: [75, 90],
  },
};

export default nextConfig;
