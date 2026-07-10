import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/src/components/theme-provider";
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

export const metadata: Metadata = {
  title: "Forwarders ERP by DHer",
  description:
    "ERP para freight forwarders: cotizaciones, pricing, operaciones, documentos y margenes en una sola plataforma.",
  icons: {
    icon: [
      { url: '/brand/app-icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/app-icon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: { url: '/brand/app-icon-1024.png' },
    shortcut: '/brand/app-icon-32.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
