import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Store — PostDuty",
  description:
    "Thoughtful accessories, keepsakes and gifts for doctors, nurses and healthcare students.",
  alternates: { canonical: "/store" },
};

export default function StoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
