'use client';

import { useRouter } from 'next/navigation';
import { Check, ChevronDown, MapPin, Settings2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAdminRegionFilter } from '@/lib/region-filter';

export function RegionSelector() {
  const router = useRouter();
  const { regionId, setRegionId, selectedRegion, regions, isLoading } = useAdminRegionFilter();

  const totalCompanies = regions.reduce((sum, region) => sum + region.companyCount, 0);
  const totalDrivers = regions.reduce((sum, region) => sum + region.driverCount, 0);
  const currentLabel = selectedRegion?.name ?? 'Todas as cidades';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Cidade selecionada: ${currentLabel}`}
        title={`Cidade selecionada: ${currentLabel}`}
        className={`inline-flex h-9 min-w-0 max-w-[7rem] shrink items-center gap-1 rounded-lg border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:max-w-[14rem] sm:shrink-0 sm:gap-1.5 sm:px-2.5 ${
          selectedRegion
            ? 'border-[#9ce2de]/45 bg-primary/25 font-semibold text-white shadow-[0_0_0_1px_rgba(156,226,222,0.12)] hover:bg-primary/35'
            : 'border-white/12 bg-white/[0.06] font-medium text-white/85 hover:bg-white/10 hover:text-white'
        }`}
      >
        <MapPin className="size-3.5 shrink-0 text-[#9ce2de]" aria-hidden="true" />
        <span className="truncate">
          {isLoading && regions.length === 0 ? (
            'Cidades...'
          ) : selectedRegion ? (
            selectedRegion.name
          ) : (
            <>
              <span className="sm:hidden">Cidades</span>
              <span className="hidden sm:inline">Todas as cidades</span>
            </>
          )}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-white/55" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-1.5">
        <div className="px-2.5 pt-1 pb-2">
          <p className="font-heading text-sm font-semibold text-admin-deep">Cidade do painel</p>
          <p className="text-xs text-muted-foreground">
            Separa empresas, entregadores, pedidos e operação por cidade.
          </p>
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => setRegionId('')}
            className={`justify-between gap-2 px-2.5 py-2 ${
              regionId === '' ? 'bg-admin-soft font-semibold text-admin-deep' : ''
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm">Todas as cidades</p>
              {regions.length > 0 && (
                <p className="text-[11px] font-normal text-muted-foreground">
                  {totalCompanies} empresa(s) · {totalDrivers} entregador(es)
                </p>
              )}
            </div>
            {regionId === '' && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
          </DropdownMenuItem>

          {regions.map((region) => {
            const active = region.id === regionId;
            return (
              <DropdownMenuItem
                key={region.id}
                onClick={() => setRegionId(region.id)}
                className={`justify-between gap-2 px-2.5 py-2 ${
                  active ? 'bg-admin-soft font-semibold text-admin-deep' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm">{region.name}</p>
                    {!region.active && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Inativa
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-normal text-muted-foreground">
                    {region.companyCount} empresa(s) · {region.driverCount} entregador(es)
                  </p>
                </div>
                {active && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => router.push('/configuracoes/regioes')}
            className="gap-2 px-2.5 py-2 text-xs font-medium text-muted-foreground"
          >
            <Settings2 className="size-3.5 text-primary" aria-hidden="true" />
            Gerenciar cidades
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
