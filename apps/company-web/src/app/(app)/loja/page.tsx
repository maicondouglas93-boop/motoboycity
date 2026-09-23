import { redirect } from 'next/navigation';

/** A Loja abre em Produtos: sem catálogo não existe venda para acompanhar. */
export default function LojaPage() {
  redirect('/loja/produtos');
}
