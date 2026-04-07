import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PCHS Football Dashboard',
  description: 'Pell City High School Football — GPS Performance Dashboard',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  );
}
