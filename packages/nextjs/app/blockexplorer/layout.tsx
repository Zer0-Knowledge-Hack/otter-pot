import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";

export const metadata = getMetadata({
  title: "Block Explorer",
  description: "Block Explorer created with 🏗 Scaffold-Stylus",
});

const BlockExplorerLayout = ({ children }: { children: React.ReactNode }) => {
  // Los providers del scaffold viven en las rutas heredadas, no en el layout raíz.
  return <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>;
};

export default BlockExplorerLayout;
