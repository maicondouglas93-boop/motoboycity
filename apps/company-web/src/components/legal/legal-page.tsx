import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileCheck2, ShieldCheck } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';

export const LEGAL_CONTACT_EMAIL = 'maicondouglas93@gmail.com';

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalPageProps {
  kind: 'terms' | 'privacy';
  title: string;
  summary: string;
  updatedAt: string;
  sections: LegalSection[];
}

export function LegalPage({ kind, title, summary, updatedAt, sections }: LegalPageProps) {
  const Icon = kind === 'privacy' ? ShieldCheck : FileCheck2;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-white/10 bg-asfalto text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/login" aria-label="MOTOboyCity - inicio" className="rounded-lg">
            <Wordmark height={30} />
          </Link>
          <nav aria-label="Documentos legais" className="flex items-center gap-1 text-sm">
            <Link
              href="/termos-de-uso"
              aria-current={kind === 'terms' ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 transition-colors ${
                kind === 'terms'
                  ? 'bg-white/12 font-semibold text-white'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              Termos de Uso
            </Link>
            <Link
              href="/politica-de-privacidade"
              aria-current={kind === 'privacy' ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 transition-colors ${
                kind === 'privacy'
                  ? 'bg-white/12 font-semibold text-white'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              Privacidade
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="border-b border-portal/10 bg-gradient-to-br from-portal-soft/80 via-card to-colete/10">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-portal hover:text-portal-deep"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Voltar para entrar
            </Link>
            <div className="mt-7 flex max-w-3xl items-start gap-4">
              <span className="rounded-2xl border border-portal/15 bg-card p-3 text-portal shadow-sm">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="font-mono text-xs font-semibold tracking-[0.18em] text-portal uppercase">
                  Documento público
                </p>
                <h1 className="font-heading mt-2 text-4xl font-extrabold tracking-[-0.04em] text-portal-deep sm:text-5xl">
                  {title}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
                  {summary}
                </p>
                <p className="mt-4 text-xs font-medium text-muted-foreground">
                  Última atualização: {updatedAt}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl items-start gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-14">
          <aside className="rounded-2xl border border-portal/10 bg-card/90 p-4 shadow-sm lg:sticky lg:top-6">
            <p className="font-heading text-sm font-semibold text-portal-deep">Nesta página</p>
            <ol className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="flex gap-2 rounded-lg px-2 py-1.5 text-xs leading-5 text-muted-foreground transition-colors hover:bg-portal-soft hover:text-portal-deep"
                  >
                    <span className="font-mono text-[10px] text-portal">{index + 1}.</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </aside>

          <article className="space-y-4">
            {sections.map((section, index) => (
              <section
                id={section.id}
                key={section.id}
                className="scroll-mt-6 rounded-2xl border border-portal/10 bg-card/95 p-5 shadow-[0_14px_36px_-30px_rgba(15,107,112,0.7)] sm:p-7"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs font-semibold text-portal">{index + 1}</span>
                  <h2 className="font-heading text-xl font-bold tracking-[-0.025em] text-portal-deep">
                    {section.title}
                  </h2>
                </div>
                <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground [&_a]:font-semibold [&_a]:text-portal [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                  {section.content}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-asfalto text-white/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 MOTOboyCity. Plataforma de tecnologia para entregas.</p>
          <div className="flex gap-4">
            <Link href="/termos-de-uso" className="hover:text-white">
              Termos
            </Link>
            <Link href="/politica-de-privacidade" className="hover:text-white">
              Privacidade
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
