import type { Metadata } from "next";
import { ExperienceProvider } from "../components/providers/ExperienceProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cali Guia",
  description: "Desarrollado por TripKode",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ExperienceProvider>{children}</ExperienceProvider>
      </body>
    </html>
  );
}
