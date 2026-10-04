/**
 * Stub ESM/CJS for optional peers (@x402/*, Coinbase CDP) pulled by RainbowKit.
 * Named + default exports are no-ops so static and dynamic imports resolve.
 */
function stub() {
  return undefined;
}

const proxy = new Proxy(stub, {
  get(_target, prop) {
    if (prop === "__esModule") return true;
    if (prop === "default") return proxy;
    if (prop === "then") return undefined;
    if (prop === Symbol.toStringTag) return "Module";
    return stub;
  },
  apply() {
    return undefined;
  },
});

module.exports = proxy;
module.exports.default = proxy;
module.exports.__esModule = true;
// Common named exports some packages expect
module.exports.toClientEvmSigner = stub;
module.exports.registerExactEvmScheme = stub;
module.exports.UptoEvmScheme = stub;
module.exports.fromCdpSmartWallet = stub;
module.exports.registerExactSvmScheme = stub;
module.exports.cdpSolanaAccountToSvmSigner = stub;
module.exports.createX402Client = stub;
module.exports.ExactEvmScheme = stub;
