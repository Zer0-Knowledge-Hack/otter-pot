import { Inter, Orbitron } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import { Metadata } from "next";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["400", "700", "900"],
});

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : `http://localhost:${process.env.PORT || 3000}`;
const imageUrl = `${baseUrl}/thumbnail.jpg`;

const title = "OtterPot — El pozo existe antes de que haya un ganador";
const titleTemplate = "%s | OtterPot";
const description =
  "Retos con pozo compartido dentro de Telegram. El dinero queda bloqueado en un contrato en Arbitrum: nadie lo custodia y nadie puede desviarlo.";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: title,
    template: titleTemplate,
  },
  description,
  openGraph: {
    title: {
      default: title,
      template: titleTemplate,
    },
    description,
    images: [
      {
        url: imageUrl,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: [imageUrl],
    title: {
      default: title,
      template: titleTemplate,
    },
    description,
  },
  icons: {
    icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
  },
};

/**
 * Layout raíz — deliberadamente sin los providers del scaffold.
 *
 * `ScaffoldEthAppWithProviders` devuelve `null` hasta montar en el cliente, así que
 * cualquier página `"use client"` que cuelgue de él no emite nada en el servidor y
 * queda en blanco si algo falla al hidratar — que es exactamente lo que le pasaba a
 * `/depositar`. Las páginas de OtterPot no necesitan wagmi ni RainbowKit: hablan con
 * la cadena por viem directo (`STACK.md` §1).
 *
 * Los providers se movieron a las rutas heredadas que sí los usan: `/debug` y
 * `/blockexplorer`, cada una con su propio layout.
 */
const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning>
      <body className={`${inter.variable} ${orbitron.variable} font-sans`} suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
