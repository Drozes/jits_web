import type { Metadata, Viewport } from "next";
import { Bebas_Neue, DM_Sans, Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./design-system/tokens.css";
import "./globals.css";
import "./design-system/tokens.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:4983";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "ELO RATED",
  description: "Track your jiu-jitsu journey",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ELO RATED",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#dc2626",
};

const bebasNeue = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const dmSans = DM_Sans({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-heading' });
const inter = Inter({ subsets: ['latin'], variable: '--font-body' });
const jetbrainsMono = JetBrains_Mono({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-mono' });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${bebasNeue.variable} ${dmSans.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
