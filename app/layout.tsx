import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { TRPCProvider } from "./trpc-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SamApp",
  description: "A private personal evidence tracker.",
  applicationName: "SamApp",
  icons: {
    icon: "/sam.jpeg",
    apple: "/sam.jpeg"
  },
  appleWebApp: {
    capable: true,
    title: "SamApp",
    statusBarStyle: "default"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  themeColor: "#f7f2ea",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <TRPCProvider>{children}</TRPCProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
