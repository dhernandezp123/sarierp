import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/src/components/theme-provider";
import { TenantProvider } from "@/src/components/tenant/TenantProvider";
import { readTenantHeaders } from "@/src/lib/tenant-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const tenant = readTenantHeaders(await headers())
  const brandName = tenant?.tradeName || 'Forwarders ERP'

  return {
    title: {
      default: tenant ? `${brandName} | Forwarders ERP` : 'Forwarders ERP by Hernova Systems',
      template: `%s | ${brandName}`,
    },
    applicationName: brandName,
    description: tenant
      ? `Plataforma logÃ­stica de ${brandName}, operada con Forwarders ERP.`
      : 'ERP para freight forwarders: cotizaciones, pricing, operaciones, documentos y margenes en una sola plataforma.',
    icons: {
      icon: [
        { url: '/brand/app-icon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/brand/app-icon-16.png', sizes: '16x16', type: 'image/png' },
      ],
      apple: { url: '/brand/app-icon-1024.png' },
      shortcut: '/brand/app-icon-32.png',
    },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenant = readTenantHeaders(await headers())
  const tenantStyles = tenant
    ? ({
        '--tenant-primary': tenant.primaryColor,
        '--tenant-secondary': tenant.secondaryColor,
      } as CSSProperties)
    : undefined

  return (
    <html
      lang="es"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
      style={tenantStyles}
    >
      <body className="min-h-full flex flex-col font-sans">
        <TenantProvider tenant={tenant}>
          <ThemeProvider>
            {children}
            <Toaster richColors position="top-right" />
          </ThemeProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
