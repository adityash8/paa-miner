import './globals.css';

export const metadata = {
  title: 'PAA Miner',
  description: 'Accuracy-first People Also Ask extraction for GEO optimization',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 font-sans min-h-screen">
        <main className="max-w-4xl mx-auto py-12 px-6">{children}</main>
      </body>
    </html>
  );
}
