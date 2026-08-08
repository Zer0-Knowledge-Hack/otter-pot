import { Sora } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import { Metadata, Viewport } from "next";
import { ThemeProvider } from "~~/components/ThemeProvider";
import { ClientProviders } from "~~/components/ClientProviders";
import { RegisterSW } from "~~/components/otterpot/RegisterSW";
import { TelegramScript } from "~~/components/otterpot/TelegramScript";
import "~~/styles/globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["400", "500", "600", "700"],
});

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : `http://localhost:${process.env.PORT || 3000}`;
const imageUrl = `${baseUrl}/thumbnail.jpg`;

const title = "OtterPot";
const titleTemplate = "%s | OtterPot";
const description =
  "Convierte tus metas en retos con recompensas reales. Pozo USDC en Arbitrum + Telegram Mini App.";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: title,
    template: titleTemplate,
  },
  description,
  applicationName: "OtterPot",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OtterPot",
  },
  openGraph: {
    title: {
      default: title,
      template: titleTemplate,
    },
    description,
    images: [{ url: imageUrl }],
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

export const viewport: Viewport = {
  themeColor: "#111D43",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body className={`${sora.variable} font-sans`} suppressHydrationWarning>
        <ThemeProvider>
          <ClientProviders>{children}</ClientProviders>
          <RegisterSW />
          <TelegramScript />
        </ThemeProvider>
      </body>
    </html>
  );
}
