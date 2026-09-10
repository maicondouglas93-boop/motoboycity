import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import styles from './print-layout.module.css';

export default function PrintLayout({ children }: { children: ReactNode }) {
  return <div className={styles['layout']}><AuthGate>{children}</AuthGate></div>;
}
