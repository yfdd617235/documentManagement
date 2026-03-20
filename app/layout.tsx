import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Document Intelligence by YOSEF GIRALDO',
  description:
    'Search and classify your Google Drive documents using AI — powered by Vertex AI RAG Engine.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Inter font via Google Fonts — loaded in globals.css via @import */}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
