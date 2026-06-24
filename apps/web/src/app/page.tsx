import Link from "next/link";

// Minimal placeholder — NOT product UI. Real UI waits on DESIGN.md (design
// tokens / style guide). This page only exists so `/` renders something while
// the infrastructure scaffold is verified via the /health tracer.
export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        OverGarden
      </h1>
      <p className="text-muted-foreground">
        Pre-MVP infrastructure scaffold. No product UI yet — it waits on the
        design system.
      </p>
      <Link href="/health" className="text-primary underline underline-offset-4">
        Infrastructure health tracer →
      </Link>
    </main>
  );
}
