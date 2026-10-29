import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";
import { Toaster } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Jarvis",
  description: "Tu asistente personal",
  applicationName: "Jarvis",
  appleWebApp: { capable: true, title: "Jarvis", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05080f",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">
        {children}
        <Toaster />
        <ServiceWorker />
      </body>
    </html>
  );
}
