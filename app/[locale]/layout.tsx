import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AuthSessionProvider } from "../../components/providers/AuthSessionProvider";
import { ExperienceProvider } from "../../components/providers/ExperienceProvider";
import { routing } from "../../i18n/routing";
import "flag-icons/css/flag-icons.min.css";
import "../globals.css";

export const metadata: Metadata = {
  title: "Cali Guia",
  description: "Desarrollado por TripKode",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <AuthSessionProvider>
            <ExperienceProvider>{children}</ExperienceProvider>
          </AuthSessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
