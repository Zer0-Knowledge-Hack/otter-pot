// @ts-check
const path = require("path");

/**
 * Turbopack (Windows) rejects absolute paths in resolveAlias:
 * "windows imports are not implemented yet".
 * Relative aliases are from turbopack.root (monorepo root).
 */
const emptyModuleTurbo = "./packages/nextjs/utils/empty-module.js";
const emptyModuleWebpack = path.join(__dirname, "utils/empty-module.js");

const x402Packages = [
  "@x402/core/client",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/upto/client",
  "@x402/svm/exact/client",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  agentRules: false,

  // Generar sitio estático para Firebase Hosting
  output: "export",

  images: {
    unoptimized: true,
  },

  trailingSlash: true,

  typescript: {
    ignoreBuildErrors:
      process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },

  allowedDevOrigins: [
    "192.168.100.31",
    "127.0.0.1",
    "localhost",
  ],

  turbopack: {
    root: path.join(__dirname, "../.."),
    resolveAlias: Object.fromEntries(x402Packages.map(p => [p, emptyModuleTurbo])),
  },

  webpack: config => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(x402Packages.map(p => [p, emptyModuleWebpack])),
    };
    return config;
  },
};

module.exports = nextConfig;
