import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { DeployCommandOptions, DeployOptions } from "./utils/type";
import deployScript from "./deploy";

/**
 * Entry point for the deploy script
 * This script is used to deploy a single contract or all contracts in the stylus folder
 */
if (require.main === module) {
  // Use yargs for argument parsing
  const argv = yargs(hideBin(process.argv))
    .usage("Usage: yarn deploy --name <contractName> --network <network>")
    .option("network", {
      alias: "net",
      describe: "Network to deploy to",
      type: "string",
      demandOption: false,
    })
    .option("estimate-gas", {
      alias: "eg",
      describe: "Estimate gas for the deployment",
      type: "boolean",
      demandOption: false,
    })
    .option("max-fee", {
      alias: "mf",
      describe: "Max fee per gas gwei",
      type: "string",
      demandOption: false,
    })
    .help()
    .parseSync() as DeployCommandOptions;

  deployScript(argv as DeployOptions).catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
