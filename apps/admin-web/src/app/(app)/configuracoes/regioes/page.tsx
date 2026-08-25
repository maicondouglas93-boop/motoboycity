'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { AdminRegion } from '@motoboycity/types';
import { adminRegionSchema } from '@motoboycity/validation';
import { ChevronLeft, MapPinned, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { adminRegionsApi } from '@/lib/api-client';
import { session } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RegionsPage() {
  const token = session.getToken();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminRegion | null>(null);
  const [name, setName] = useState('');
  const [distance, setDistance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin', 'regions'],
    queryFn: () => adminRegionsApi.list(token as string),
    enabled: Boolean(token),
  });
  function start(region?: AdminRegion) {
    setEditing(region ?? null);
    setName(region?.name ?? '');
    setDistance(region?.maxDeliveryDistanceKm?.toString() ?? '');
    setError(null);
    setOpen(true);
  }
  const save = useMutation({
    mutationFn: () => {
      const payload = adminRegionSchema.parse({
        name,
        maxDeliveryDistanceKm: distance ? Number(distance) : null,
      });
      return editing
        ? adminRegionsApi.update(token as string, editing.id, payload)
        : adminRegionsApi.create(token as string, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'regions'] });
      setOpen(false);
    },
    onError: (cause) =>
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : 'Falha ao salvar regiao.',
      ),
  });
  const active = useMutation({
    mutationFn: (region: AdminRegion) =>
      adminRegionsApi.setActive(token as string, region.id, !region.active),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'regions'] }),
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : 'Falha ao alterar regiao.'),
  });
  return (
    <div className="space-y-6">
      <Link
        href="/configuracoes"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Voltar
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Regioes operacionais</h1>
          <p className="text-sm text-muted-foreground">
            Pracas usadas por empresas, motoboys, precos e despacho.
          </p>
        </div>
        <Button onClick={() => start()}>
          <Plus className="size-4" /> Nova regiao
        </Button>
      </header>
      {error && !open && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(query.data ?? []).map((region) => (
          <Card key={region.id}>
            <CardContent className="space-y-3 py-5">
              <div className="flex justify-between gap-2">
                <div className="flex gap-2">
                  <MapPinned className="size-5 text-primary" />
                  <div>
                    <p className="font-semibold">{region.name}</p>
                    <Badge variant={region.active ? 'default' : 'outline'}>
                      {region.active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => start(region)}>
                  <Pencil className="size-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Limite:{' '}
                {region.maxDeliveryDistanceKm === null
                  ? 'sem limite'
                  : `${region.maxDeliveryDistanceKm} km`}
              </p>
              <p className="text-xs text-muted-foreground">
                {region.companyCount} empresa(s) · {region.driverCount} motoboy(s)
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={active.isPending}
                onClick={() => active.mutate(region)}
              >
                {region.active ? 'Desativar' : 'Reativar'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" closeDisabled={save.isPending}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar regiao' : 'Nova regiao'}</DialogTitle>
            <DialogDescription>
              O limite vazio permite qualquer distancia aceita pela tabela de precos.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form
              className="space-y-4"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="region-name">Nome</Label>
                <Input id="region-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="region-distance">Distancia maxima (km)</Label>
                <Input
                  id="region-distance"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Salvando...' : 'Salvar regiao'}
                </Button>
              </div>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
