export default function CommunityDirectoryLoading() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-5 sm:px-6">
      <div className="h-10 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-48 animate-pulse rounded-md bg-muted" />
        <div className="h-48 animate-pulse rounded-md bg-muted" />
      </div>
    </main>
  );
}
