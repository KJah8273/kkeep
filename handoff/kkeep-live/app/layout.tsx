import type { Metadata, Viewport } from "next";
import {SITE_NAME, SITE_DESCRIPTION, SITE_URL} from '@/lib/search-metadata';
import "./globals.css";
import "./theme.css";
import "./living-space.css";
import "./kkeep-appearance.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#060608" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  // Only the public landing pages opt in to search. Browser sessions, account
  // screens and individual game players remain available without search entries.
  robots: {index: false, follow: true},
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kkeep", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/kkeep-portrait.png?v=1", type: "image/png", sizes: "192x192" }, { url: "/kkeep-portrait.png?v=1", type: "image/png", sizes: "any" }],
    shortcut: "/kkeep-portrait.png?v=1",
    apple: "/apple-touch-icon.png?v=portrait1",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="/home-redirect.js?v=2"/><script src="/living-space-boot.js?v=3"/><script src="/page-recovery.js?v=1" /><script src="/analytics/collect.js?v=2" defer />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
