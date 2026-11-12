import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Мої гроші",
  description: "Облік витрат, доходів і кредитів",
};

const NAV = [
  { href: "/", label: "Огляд" },
  { href: "/transactions", label: "Транзакції" },
  { href: "/loans", label: "Кредити" },
  { href: "/bonuses", label: "Бонуси" },
  { href: "/import", label: "Імпорт" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uk" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-5xl gap-6 px-4 py-3 text-sm">
            <span className="font-semibold">💸 Мої гроші</span>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-muted hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
