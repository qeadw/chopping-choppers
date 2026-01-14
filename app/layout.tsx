import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chopping Choppers',
  description: 'A 2D incremental forest chopping game',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
