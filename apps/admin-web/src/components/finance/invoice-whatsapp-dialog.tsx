'use client';

import { useMemo, useState } from 'react';
import type { InvoiceDetail } from '@motoboycity/types';
import { ExternalLink, MessageCircle, RefreshCw } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  buildInvoiceWhatsAppMessage,
  buildWhatsAppUrl,
  normalizeBrazilWhatsAppNumber,
} from '@/lib/whatsapp';

interface WhatsAppContact {
  memberId: string;
  name: string;
  phone: string;
}

interface InvoiceWhatsAppDialogProps {
  invoice: InvoiceDetail;
  contacts: WhatsAppContact[];
  contactsLoading: boolean;
  contactsError: boolean;
  onRetryContacts: () => void;
}

function maskedPhone(phone: string): string {
  const number = normalizeBrazilWhatsAppNumber(phone);
  if (!number) return 'Número inválido';
  const national = number.slice(2);
  return national.length === 11
    ? `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`
    : `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
}

export function InvoiceWhatsAppDialog({
  invoice,
  contacts,
  contactsLoading,
  contactsError,
  onRetryContacts,
}: InvoiceWhatsAppDialogProps) {
  const validContacts = useMemo(
    () => contacts.filter((contact) => normalizeBrazilWhatsAppNumber(contact.phone)),
    [contacts],
  );
  const [selectedMemberId, setSelectedMemberId] = useState('');

  const effectiveMemberId =
    validContacts.length === 1
      ? (validContacts[0]?.memberId ?? '')
      : validContacts.some((contact) => contact.memberId === selectedMemberId)
        ? selectedMemberId
        : '';
  const contact = validContacts.find((item) => item.memberId === effectiveMemberId);
  const message = contact
    ? buildInvoiceWhatsAppMessage({
        companyName: invoice.companyName,
        invoiceNumber: invoice.number,
        totalValue: invoice.totalValue,
        dueDate: invoice.dueDate,
        deliveryCount: invoice.deliveryCount,
      })
    : '';
  const url = contact ? buildWhatsAppUrl(contact.phone, message) : null;

  if (contactsLoading) {
    return (
      <Button variant="outline" disabled>
        <MessageCircle /> Carregando WhatsApp...
      </Button>
    );
  }

  if (contactsError) {
    return (
      <Button variant="outline" onClick={onRetryContacts}>
        <RefreshCw /> Recarregar WhatsApp
      </Button>
    );
  }

  if (validContacts.length === 0) {
    return (
      <Button variant="outline" disabled title="Nenhum responsável ativo possui WhatsApp válido">
        <MessageCircle /> WhatsApp indisponível
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline">
            <MessageCircle /> Enviar por WhatsApp
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#25D366] text-white shadow-lg shadow-emerald-500/20">
              <MessageCircle className="size-5" />
            </span>
            <div>
              <DialogTitle>Enviar resumo da fatura</DialogTitle>
              <DialogDescription>
                Revise o contato e abra a mensagem pronta no WhatsApp.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {validContacts.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="invoice-whatsapp-contact">Responsável</Label>
              <Select
                items={Object.fromEntries(validContacts.map((item) => [item.memberId, item.name]))}
                value={effectiveMemberId}
                onValueChange={(value) => setSelectedMemberId(value ?? '')}
              >
                <SelectTrigger id="invoice-whatsapp-contact" className="w-full">
                  <SelectValue placeholder="Selecione o responsável" />
                </SelectTrigger>
                <SelectContent>
                  {validContacts.map((item) => (
                    <SelectItem key={item.memberId} value={item.memberId}>
                      {item.name} · {maskedPhone(item.phone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {contact && (
            <div className="rounded-2xl border border-[#25D366]/25 bg-[#25D366]/6 px-4 py-3">
              <p className="font-medium">{contact.name}</p>
              <p className="text-sm text-muted-foreground">{maskedPhone(contact.phone)}</p>
            </div>
          )}

          {message ? (
            <div className="whitespace-pre-wrap rounded-2xl border bg-muted/35 px-4 py-3 text-sm leading-relaxed">
              {message}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-5 text-center text-sm text-muted-foreground">
              Selecione o responsável para revisar a mensagem.
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            O painel abre a conversa com o texto preenchido; o envio final é confirmado por você no
            WhatsApp.
          </p>
        </DialogBody>

        <DialogFooter className="flex justify-end">
          {url && (
            <a
              className={buttonVariants({
                className: 'bg-[#25D366] text-white hover:bg-[#1fb557]',
              })}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir WhatsApp <ExternalLink className="size-4" />
            </a>
          )}
          {!url && <Button disabled>Selecione o responsável</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
