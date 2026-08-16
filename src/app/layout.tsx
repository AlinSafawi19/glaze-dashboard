import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

// Same two families as the storefront: Inter for body copy, Clash Display for
// headings and labels.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter-loaded",
});

export const metadata: Metadata = {
  title: {
    default: "GLAZE Dashboard",
    template: "%s · GLAZE",
  },
  description: "Catalogue and orders for the Glaze store.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=clash-display@300,400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
