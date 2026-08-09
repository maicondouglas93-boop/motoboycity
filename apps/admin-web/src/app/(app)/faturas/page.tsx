import { Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { mockInvoices } from '@/lib/mock-data';

export default function AdminInvoicesPage() {
  return (
    <div className="space-y-4">
      <Input placeholder="Buscar fatura..." className="max-w-xs" />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data de Emissão</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data de Vencimento</TableHead>
                <TableHead>Data de Pagamento</TableHead>
                <TableHead>Forma de Pagamento</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="size-8" />
                      Nenhum registro
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                mockInvoices.map((invoice) => (
                  <TableRow key={invoice.number}>
                    <TableCell>{invoice.number}</TableCell>
                    <TableCell>{invoice.status}</TableCell>
                    <TableCell>{invoice.issueDate}</TableCell>
                    <TableCell>{invoice.value}</TableCell>
                    <TableCell>{invoice.dueDate}</TableCell>
                    <TableCell>{invoice.paymentDate}</TableCell>
                    <TableCell>{invoice.paymentMethod}</TableCell>
                    <TableCell />
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
