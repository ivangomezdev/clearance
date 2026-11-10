import type { Metadata } from "next";
import "./globals.css";
import {AccountProvider} from '../components/account-provider';

export const metadata: Metadata = {
  title: "Clearance Radar · Todas las ofertas, un solo lugar",
  description: "Encuentra las mejores ofertas, compara descuentos y consulta disponibilidad en tiendas con Clearance Radar.",
  icons: {
    icon: "/favicon.svg?v=radar-eye-1",
    shortcut: "/favicon.svg?v=radar-eye-1",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased"><AccountProvider>{children}</AccountProvider></body>
    </html>
  );
}
