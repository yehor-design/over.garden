import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Sprout } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getGuide, listGuides } from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface GuideRouteProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return listGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: GuideRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);

  if (!guide) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Guide | OverGarden",
      robots: missingState.robots,
    };
  }

  const indexState = evaluatePublicSurfaceIndexability({ kind: guide.kind });

  return {
    title: `${guide.title} | OverGarden`,
    description: guide.description,
    alternates: {
      canonical: guide.path,
    },
    robots: indexState.robots,
  };
}

export default async function GuidePage({ params }: GuideRouteProps) {
  const { slug } = await params;
  const guide = getGuide(slug);

  if (!guide) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <Link
          href="/blog"
          className="self-start rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          Field notes
        </Link>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">Guide</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {guide.title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {guide.description}
          </p>
        </div>
        <p className="max-w-3xl rounded-lg border border-border p-4 text-sm leading-6 text-foreground">
          {guide.outcome}
        </p>
      </header>

      <ol className="grid gap-4">
        {guide.steps.map((step, index) => (
          <li
            key={step.title}
            className="grid gap-3 rounded-lg border border-border p-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-md border border-border text-sm font-semibold">
                {index + 1}
              </span>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {step.title}
              </h2>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <CheckCircle2 className="size-5" />
          Next useful step
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {guide.relatedLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="grid gap-2 rounded-lg border border-border p-4 text-sm transition-colors hover:bg-muted"
            >
              <span className="flex items-center gap-2 font-medium text-foreground">
                {link.href === "/garden" ? (
                  <Sprout className="size-4" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                {link.label}
              </span>
              <span className="leading-6 text-muted-foreground">
                {link.description}
              </span>
            </Link>
          ))}
        </div>
        <Link href="/garden" className={buttonVariants({ className: "w-fit" })}>
          <Sprout className="size-4" />
          Open workspace
        </Link>
      </section>
    </main>
  );
}
