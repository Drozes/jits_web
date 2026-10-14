import type { Metadata, Viewport } from "next";
import { Bebas_Neue, DM_Sans, Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { smartAppBanner } from "@/lib/app-links";
import { publicSiteOrigin } from "@/lib/invites/site-origin";
import "./design-system/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  // The stable public host, never the per-deployment VERCEL_URL (it sits
  // behind Deployment Protection).
  metadataBase: new URL(publicSiteOrigin()),
  title: "ELO RATED",
  description: "BJJ matches, filmed and rated.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ELO RATED",
  },
  // Apple's Smart App Banner, only once NEXT_PUBLIC_APP_STORE_URL is set.
  itunes: smartAppBanner(),
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
        {/*
          TWO token systems must be driven together:
          - globals.css (shadcn HSL slots) keys off the `.dark` CLASS
          - design-system/tokens.css (brand tokens) keys off [data-theme]
          Writing only `class` left every [data-theme="light"] rule dead and
          pinned the brand layer to dark while shadcn resolved light, which is
          what made Arena's headings render at 1.01:1. Emit BOTH attributes.
          The brand is dark-first, so dark is the default.
        */}
        <ThemeProvider
          attribute={["class", "data-theme"]}
          defaultTheme="dark"
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
