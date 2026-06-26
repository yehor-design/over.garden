import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        OverGarden
      </h1>
      <p className="text-muted-foreground">
        Start the first garden journal entry from a real product workspace.
      </p>
      <Link href="/garden" className="text-primary underline underline-offset-4">
        Open garden journal →
      </Link>
    </main>
  );
}
