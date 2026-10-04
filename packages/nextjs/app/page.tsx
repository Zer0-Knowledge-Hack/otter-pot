/**
 * Landing de OtterPot.
 *
 * Regla que ordena el contenido: **todo lo que afirma acá tiene que ser verificable**.
 * Por eso no dice que resolvemos fricción cross-border (las fintech ya lo hacen), ni que
 * el pozo genera rendimiento (falso a esta escala), ni usa el eslogan «Retos que crecen
 * juntos» — la propia demo lo desmiente. Ver `docs/VALIDATION.md` §10 y `DESIGN.md` §1.
 *
 * Los enlaces a Arbiscan son el argumento central: un jurado los abre y ve los contratos.
 *
 * Los textos viven en `locales/es.json` y `locales/en.json` (ver `docs/LANDING_COPY.md`).
 */

import type { Metadata } from "next";
import { LandingPage } from "~~/components/otterpot/LandingPage";

export const metadata: Metadata = {
  title: "OtterPot — El pozo existe antes de que haya un ganador",
  description:
    "Retos con pozo compartido en Telegram. El dinero queda bloqueado en un contrato en Arbitrum: nadie lo custodia y nadie puede desviarlo.",
};

export default function Home() {
  return <LandingPage />;
}
