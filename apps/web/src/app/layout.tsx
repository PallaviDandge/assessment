import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Approvals & Review · Assistant",
  description: "Approvals assistant panel backed by validated LLM calls with graceful fallbacks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
