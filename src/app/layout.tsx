import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif, Newsreader } from "next/font/google";
import "./globals.css";
import Script from "next/script";

// Display: headlines, wine names at size, figures. Text serif: the taster's own voice.
// Sans: interface. Mono: specimen-style labels and data — the "scientific rigour" half.
const instrument = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Plex Sans shares the mono's engineered skeleton, so interface text and data labels read as one family.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Vino Nota", template: "%s · Vino Nota" },
  description: "A private wine field journal by HaveAnApp.",
  applicationName: "Vino Nota",
  appleWebApp: { capable: true, title: "Vino Nota", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3eee3" },
    { media: "(prefers-color-scheme: dark)", color: "#171312" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        {/* HaveAnApp Pulse: anonymous, cookieless usage counts. */}
        <Script src="https://haveanapp-pulse-collect.vercel.app/p.js" data-app="vino-nota" strategy="afterInteractive" />
      </body>
    </html>
  );
}
