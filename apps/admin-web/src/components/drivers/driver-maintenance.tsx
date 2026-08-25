'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@motoboycity/api-client';
import type { AdminDriverDetail, DriverDocumentType } from '@motoboycity/types';
import { adminDriverDocumentSchema, adminUpdateDriverSchema } from '@motoboycity/validation';
import { ExternalLink, FileUp, Pencil, Trash2 } from 'lucide-react';
import { adminDriversApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function publish(queryClient: ReturnType<typeof useQueryClient>, driver: AdminDriverDetail) {
  queryClient.setQueryData(['admin', 'driver', driver.id], driver);
  void queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
}

export function EditDriverDialog({ driver, token }: { driver: AdminDriverDetail; token: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    name: driver.name,
    email: driver.email,
    phone: driver.phone,
    cpf: driver.cpf,
    birthDate: driver.birthDate,
    pixKey: driver.pixKey,
    pixKeyType: driver.pixKeyType,
    hasCnpj: driver.hasCnpj,
    regionId: driver.region.id,
  }));
  const [error, setError] = useState<string | null>(null);
  const options = useQuery({
    queryKey: ['admin', 'driver-registration-options'],
    queryFn: () => adminDriversApi.registrationOptions(token),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: () => adminDriversApi.update(token, driver.id, adminUpdateDriverSchema.parse(form)),
    onSuccess: (updated) => {
      publish(queryClient, updated);
      setOpen(false);
    },
    onError: (cause) =>
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : 'Nao foi possivel atualizar o motoboy.',
      ),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-3.5" /> Editar cadastro
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl" closeDisabled={save.isPending}>
        <DialogHeader>
          <DialogTitle>Editar {driver.name}</DialogTitle>
          <DialogDescription>Dados pessoais, financeiros e regiao operacional.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            {(['name', 'email', 'phone', 'cpf', 'birthDate', 'pixKey'] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`driver-${field}`}>
                  {
                    (
                      {
                        name: 'Nome completo',
                        email: 'E-mail',
                        phone: 'Telefone',
                        cpf: 'CPF',
                        birthDate: 'Nascimento',
                        pixKey: 'Chave PIX',
                      } as const
                    )[field]
                  }
                </Label>
                <Input
                  id={`driver-${field}`}
                  type={field === 'email' ? 'email' : field === 'birthDate' ? 'date' : 'text'}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="driver-pix-type">Tipo PIX</Label>
              <select
                id="driver-pix-type"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.pixKeyType}
                onChange={(e) => setForm({ ...form, pixKeyType: e.target.value })}
              >
                {['CPF', 'EMAIL', 'PHONE', 'RANDOM'].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="driver-region">Regiao</Label>
              <select
                id="driver-region"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.regionId}
                onChange={(e) => setForm({ ...form, regionId: e.target.value })}
              >
                {(options.data?.regions ?? [driver.region]).map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.hasCnpj}
                onChange={(e) => setForm({ ...form, hasCnpj: e.target.checked })}
              />{' '}
              Possui CNPJ
            </label>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Salvando...' : 'Salvar cadastro'}
              </Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

const typeLabels: Record<DriverDocumentType, string> = {
  SELFIE: 'Selfie',
  RG: 'RG',
  CNH_FRONT: 'CNH frente',
  CNH_BACK: 'CNH verso',
  PROOF_OF_ADDRESS: 'Comprovante de endereco',
};

export function DriverDocumentsManager({
  driver,
  token,
}: {
  driver: AdminDriverDetail;
  token: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DriverDocumentType>('RG');
  const [file, setFile] = useState<File | null>(null);
  const [cnhNumber, setCnhNumber] = useState('');
  const [cnhExpiresAt, setCnhExpiresAt] = useState('');
  const [rgIssuer, setRgIssuer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione um arquivo.');
      const metadata = adminDriverDocumentSchema.parse({
        type,
        cnhNumber: cnhNumber || undefined,
        cnhExpiresAt: cnhExpiresAt || undefined,
        rgIssuer: rgIssuer || undefined,
      });
      const data = new FormData();
      data.append('file', file);
      data.append('type', metadata.type);
      if (metadata.cnhNumber) data.append('cnhNumber', metadata.cnhNumber);
      if (metadata.cnhExpiresAt) data.append('cnhExpiresAt', metadata.cnhExpiresAt);
      if (metadata.rgIssuer) data.append('rgIssuer', metadata.rgIssuer);
      return adminDriversApi.uploadDocument(token, driver.id, data);
    },
    onSuccess: (updated) => {
      publish(queryClient, updated);
      setOpen(false);
      setFile(null);
    },
    onError: (cause) =>
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : 'Falha no upload.',
      ),
  });
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      adminDriversApi.reviewDocument(token, driver.id, id, { reviewStatus: status }),
    onSuccess: (updated) => publish(queryClient, updated),
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : 'Falha ao revisar documento.'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminDriversApi.deleteDocument(token, driver.id, id),
    onSuccess: (updated) => publish(queryClient, updated),
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : 'Falha ao remover documento.'),
  });
  return (
    <div className="space-y-4">
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
      >
        <FileUp className="size-4" /> Adicionar documento
      </Button>
      {error && !open && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {driver.documents.map((document) => (
          <div key={document.id} className="rounded-xl border bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{typeLabels[document.type]}</p>
                <Badge
                  variant={
                    document.reviewStatus === 'APPROVED'
                      ? 'default'
                      : document.reviewStatus === 'REJECTED'
                        ? 'destructive'
                        : 'outline'
                  }
                >
                  {document.reviewStatus === 'APPROVED'
                    ? 'Aprovado'
                    : document.reviewStatus === 'REJECTED'
                      ? 'Rejeitado'
                      : 'Pendente'}
                </Badge>
              </div>
              <a
                href={document.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary"
                aria-label="Abrir documento"
              >
                <ExternalLink className="size-4" />
              </a>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="xs"
                onClick={() => review.mutate({ id: document.id, status: 'APPROVED' })}
              >
                Aprovar
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => review.mutate({ id: document.id, status: 'REJECTED' })}
              >
                Rejeitar
              </Button>
              <Button
                size="icon-xs"
                variant="destructive"
                aria-label="Remover"
                onClick={() =>
                  window.confirm('Remover este documento?') && remove.mutate(document.id)
                }
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {driver.documents.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum documento cadastrado.</p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" closeDisabled={upload.isPending}>
          <DialogHeader>
            <DialogTitle>Adicionar documento</DialogTitle>
            <DialogDescription>Arquivos JPG, PNG, WEBP ou PDF, com ate 8 MB.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form
              className="space-y-4"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                upload.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="document-type">Tipo</Label>
                <select
                  id="document-type"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as DriverDocumentType)}
                >
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="document-file">Arquivo</Label>
                <Input
                  id="document-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {type === 'RG' && (
                <div className="space-y-1.5">
                  <Label htmlFor="rg-issuer">Orgao emissor</Label>
                  <Input
                    id="rg-issuer"
                    value={rgIssuer}
                    onChange={(e) => setRgIssuer(e.target.value)}
                  />
                </div>
              )}
              {(type === 'CNH_FRONT' || type === 'CNH_BACK') && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cnh-number">Numero CNH</Label>
                    <Input
                      id="cnh-number"
                      value={cnhNumber}
                      onChange={(e) => setCnhNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cnh-expiry">Validade</Label>
                    <Input
                      id="cnh-expiry"
                      type="date"
                      value={cnhExpiresAt}
                      onChange={(e) => setCnhExpiresAt(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={upload.isPending}>
                  {upload.isPending ? 'Enviando...' : 'Enviar documento'}
                </Button>
              </div>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
