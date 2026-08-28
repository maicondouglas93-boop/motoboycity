import { Code2, MessageCircle } from 'lucide-react';

const whatsappMessage = encodeURIComponent(
  'Olá, Franklim! Vi seu contato no MOTOboyCity e gostaria de conhecer os serviços da FM Software.',
);
const whatsappUrl = `https://wa.me/5519997050303?text=${whatsappMessage}`;

export function FmSoftwarePromo() {
  return (
    <aside
      aria-label="Desenvolvimento do sistema"
      className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-portal/15 bg-gradient-to-r from-card via-card to-portal-soft/55 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-portal/10 text-portal">
          <Code2 className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-portal uppercase">
            Soluções em software
          </p>
          <p className="text-sm font-semibold text-foreground">
            Sistema desenvolvido por Franklim Melo — FM Software
          </p>
          <p className="text-xs text-muted-foreground">
            Precisa de um sistema para sua empresa? Entre em contato.
          </p>
        </div>
      </div>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar com a FM Software pelo WhatsApp no número (19) 99705-0303"
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1fb85a] focus-visible:ring-2 focus-visible:ring-[#25D366]/45 focus-visible:outline-none"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        <span className="flex flex-col items-start leading-tight">
          <span>Falar no WhatsApp</span>
          <span className="text-[11px] font-medium text-white/85">(19) 99705-0303</span>
        </span>
      </a>
    </aside>
  );
}
