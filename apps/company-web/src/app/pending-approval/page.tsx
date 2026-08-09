export default function PendingApprovalPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-2 rounded-lg border bg-background p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-green-600">Seu cadastro está sendo analisado!</p>
        <p className="text-sm text-muted-foreground">Aguarde a aprovação para utilizar o app</p>
      </div>
    </div>
  );
}
