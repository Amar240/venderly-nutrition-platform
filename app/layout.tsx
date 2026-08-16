import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Woodbridge Nutrition Platform",
  description:
    "Prototype with synthetic data. School nutrition, family payments, and cafeteria operations pilot.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
