import type { Metadata } from 'next';
import { Archivo, Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/query-provider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/** Face de display. O eixo `wdth` dá a largura de letreiro de sinalização. */
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
});

export const metadata: Metadata = {
  title: 'MOTOboyCity — Administração',
  description: 'Painel Web Administrativo — MOTOboyCity',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
