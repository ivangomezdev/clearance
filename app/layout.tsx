import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clearance Radar · Todas las ofertas, un solo lugar",
  description: "Explora las ofertas públicas de Hidden Clearances, compara descuentos y abre el enlace de compra resuelto por su API.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
