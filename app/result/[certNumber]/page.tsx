type PageProps = {
  params: Promise<{ certNumber: string }>;
};

export default async function ResultPage({ params }: PageProps) {
  const { certNumber } = await params;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-gray-100 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          The Policy Place
        </h1>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900">
          Cert {certNumber} — download placeholder
        </h2>
        <p className="mt-4 text-sm text-gray-600">
          Phase 3 will render the generated PDF download link here.
        </p>
      </main>
    </div>
  );
}
