import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
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
  title: "PostDuty — Gifts for Healthcare Heroes",
  description:
    "Thoughtful gifts for nurses, doctors, and every healthcare hero. Shop accessories and keepsakes to celebrate the caregivers in your life.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className={`${jakarta.variable} ${fraunces.variable} font-sans antialiased`}>
        <CartProvider>
          <div className="min-h-screen flex flex-col bg-warm-bg">
            <Header />
            <div className="flex-1">{children}</div>
            <Footer />
          </div>
        </CartProvider>
      </body>
    </html>
  );
}
