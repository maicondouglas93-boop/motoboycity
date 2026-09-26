import { SignIn } from '@clerk/nextjs';
import { CONTA_DISPONIVEL } from '@/lib/conta-da-loja';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center">
      {CONTA_DISPONIVEL ? (
        <SignIn />
      ) : (
        <p className="text-sm text-muted-foreground">
          A conta das lojas ainda não está disponível.
        </p>
      )}
    </div>
  );
}
