import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./theme.css";
import "./living-space.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#060608" };

export const metadata: Metadata = {
  title: "Kkeep",
  description: "Your space for YouTube, TikTok, Roblox, Clash Royale, and the web.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kkeep", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/kkeep-icon.png", type: "image/png", sizes: "192x192" }, { url: "/kkeep-icon.svg", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/kkeep-icon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head><script src="/living-space-boot.js?v=1"/><script src="/page-recovery.js?v=1" /><script src="/analytics/collect.js?v=1" defer /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
