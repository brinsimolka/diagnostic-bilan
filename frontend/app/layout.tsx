import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BenchProvider } from "@/components/BenchProvider";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Diagnostic de bilan",
  description: "Analyse financière automatisée d'un bilan, comparée aux moyennes sectorielles des marchés émergents.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Source+Sans+3:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <BenchProvider>
          <div className="wrap">
            <header className="top">
              <div>
                <h1>Diagnostic de bilan</h1>
                <p>
                  Importez un bilan sous n&apos;importe quel format. Les chiffres clés sont extraits, les ratios calculés et
                  comparés aux moyennes sectorielles des marchés émergents (Damodaran, NYU Stern).
                </p>
              </div>
              <Nav />
            </header>
            {children}
          </div>
        </BenchProvider>
      </body>
    </html>
  );
}
