import type { Metadata, Viewport } from "next";

import { DemoProvider } from "@/components/demo/demo-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FeedPulse",
    template: "%s · FeedPulse"
  },
  description: "Préparez, validez et programmez la communication sociale de vos marques et établissements.",
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  themeColor: "#101722",
  colorScheme: "light"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
