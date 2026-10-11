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
  title: "PostDuty — Gifts for Healthcare Heroes",
  description:
    "Thoughtful gifts for nurses, doctors, and every healthcare hero. Shop accessories and keepsakes to celebrate the caregivers in your life.",
  openGraph: {
    title: "PostDuty — Gifts for Healthcare Heroes",
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
          <SiteShell>{children}</SiteShell>
        </CartProvider>
      </body>
    </html>
  );
}
