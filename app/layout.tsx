import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SWRegister } from "@/components/sw-register";
import { ThemeProvider } from "@/components/theme-provider";
import { initializeDatabase } from "@/lib/db/init";

initializeDatabase();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Budget Analyser",
  description:
    "Track your income, expenses, and savings with a personal budget analyser.",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon1.png", type: "image/png" }],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Budget",
    statusBarStyle: "black-translucent",
  },
  themeColor: "#003b66",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="h-full bg-background text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <SWRegister />
      </body>
    </html>
  );
}
