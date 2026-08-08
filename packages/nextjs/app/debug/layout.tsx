/**
 * Los providers del scaffold (wagmi, RainbowKit, react-query) viven acá y no en el
 * layout raíz: solo las páginas heredadas los necesitan. Ver `app/layout.tsx`.
 */
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";

export default function DebugLayout({ children }: { children: React.ReactNode }) {
  return <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>;
}
