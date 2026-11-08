import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clearance Radar · Todas las ofertas, un solo lugar",
  description: "Encuentra las mejores ofertas, compara descuentos y consulta disponibilidad en tiendas con Clearance Radar.",
  icons: {
    icon: "/favicon.svg?v=yellow-2",
    shortcut: "/favicon.svg?v=yellow-2",
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
