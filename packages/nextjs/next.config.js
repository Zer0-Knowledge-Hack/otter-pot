// @ts-check
// Next carga este archivo como CommonJS: `require` es lo correcto acá.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");

/**
 * Optional peers that RainbowKit / MetaMask / Coinbase CDP pull in.
 * Webpack usa rutas absolutas; Turbopack las resuelve relativas a packages/nextjs
 * (en Windows rechaza rutas absolutas).
 */
const emptyAbs = path.join(__dirname, "utils/empty-module.js");
const emptyTurbo = "./utils/empty-module.js";
const asyncStorageAbs = path.join(__dirname, "utils/async-storage-stub");
const asyncStorageTurbo = "./utils/async-storage-stub";

/** @type {Record<string, { turbo: string, webpack: string | false }>} */
const optionalStubs = {
  "@x402/core/client": { turbo: emptyTurbo, webpack: emptyAbs },
  "@x402/core": { turbo: emptyTurbo, webpack: emptyAbs },
  "@x402/evm": { turbo: emptyTurbo, webpack: emptyAbs },
  "@x402/evm/exact/client": { turbo: emptyTurbo, webpack: emptyAbs },
  "@x402/evm/upto/client": { turbo: emptyTurbo, webpack: emptyAbs },
  "@x402/svm": { turbo: emptyTurbo, webpack: emptyAbs },
  "@x402/svm/exact/client": { turbo: emptyTurbo, webpack: emptyAbs },
  "@coinbase/cdp-sdk": { turbo: emptyTurbo, webpack: emptyAbs },
  "@base-org/account": { turbo: emptyTurbo, webpack: emptyAbs },
  "@react-native-async-storage/async-storage": {
    turbo: asyncStorageTurbo,
    webpack: asyncStorageAbs,
  },
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  agentRules: false,

  // Static export → carpeta `out/` (Firebase Hosting)
  output: "export",
  distDir: ".next",

  images: {
    unoptimized: true,
  },

  trailingSlash: true,

  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },

  allowedDevOrigins: ["192.168.100.31", "192.168.36.1", "127.0.0.1", "localhost"],

  experimental: {
    optimizePackageImports: ["lucide-react", "@heroicons/react"],
  },

  turbopack: {
    root: path.join(__dirname, "../.."),
    resolveAlias: Object.fromEntries(
      Object.entries(optionalStubs).map(([k, v]) => [k, v.turbo]),
    ),
  },

  webpack: (config, { webpack: wp }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(
        Object.entries(optionalStubs).map(([k, v]) => [k, v.webpack]),
      ),
    };

    // Evita que webpack intente resolver peers opcionales rotos
    config.plugins.push(
      new wp.NormalModuleReplacementPlugin(/^@x402\//, emptyAbs),
    );

    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.next/**",
        "**/out/**",
        "**/packages/stylus/**",
        "**/packages/contracts/**",
        "**/packages/worker/**",
      ],
    };

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    return config;
  },
};

module.exports = nextConfig;
