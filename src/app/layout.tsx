import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import SiteShell from "@/components/SiteShell";
import { CartProvider } from "@/components/CartContext";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://postduty.in"),
  robots: process.env.COMMERCE_SANDBOX === "true" ? { index: false, follow: false } : undefined,
  title: "PostDuty — Considered gifts & independent makers",
  description:
    "Healthcare gifts, handmade pieces and personalised objects from PostDuty and approved independent makers.",
  openGraph: {
    title: "PostDuty — Considered gifts & independent makers",
    description:
      "Thoughtful accessories, gifts and keepsakes for healthcare professionals.",
    siteName: "PostDuty",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className={`${jakarta.variable} ${fraunces.variable} font-sans antialiased`}>
        <CartProvider>
          {process.env.COMMERCE_SANDBOX === "true" && <div role="note" style={{background:"#243e32",color:"#fff7df",padding:"8px 16px",textAlign:"center",fontSize:12}}>Owner preview · fictional test products · no real orders or payments</div>}
          {process.env.COMMERCE_CATALOG_ONLY === "true" && <div role="note" style={{background:"#243e32",color:"#fff7df",padding:"8px 16px",textAlign:"center",fontSize:12}}>Explore the PostDuty collection · Ordering opens soon</div>}
          <SiteShell>{children}</SiteShell>
        </CartProvider>
      </body>
    </html>
  );
}
