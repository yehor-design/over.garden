import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, HelpCircle, Sprout } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  buildAnswerPageJsonLd,
  getAnswerPage,
  listAnswerPages,
} from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface AnswerRouteProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return listAnswerPages().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: AnswerRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getAnswerPage(slug);

  if (!page) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Answer | OverGarden",
      robots: missingState.robots,
    };
  }

  const indexState = evaluatePublicSurfaceIndexability({ kind: page.kind });

  return {
    title: `${page.title} | OverGarden`,
    description: page.description,
    alternates: {
      canonical: page.path,
    },
    robots: indexState.robots,
  };
}

export default async function AnswerPage({ params }: AnswerRouteProps) {
  const { slug } = await params;
  const page = getAnswerPage(slug);

  if (!page) notFound();

  const jsonLd = buildAnswerPageJsonLd(page);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <Link
          href="/blog"
          className="self-start rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          Field notes
        </Link>
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <HelpCircle className="size-4" />
            Answer
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {page.question}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {page.description}
          </p>
        </div>
      </header>

      <section className="grid gap-3 rounded-lg border border-border p-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Concise answer
        </h2>
        <p className="max-w-3xl text-base leading-7 text-foreground">
          {page.conciseAnswer}
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          What to record as proof
        </h2>
        <ul className="grid gap-3">
          {page.proofDetails.map((detail) => (
            <li
              key={detail}
              className="rounded-lg border border-border p-4 text-sm leading-6 text-muted-foreground"
            >
              {detail}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <RelatedLinkGroup
          title="Related varieties"
          links={page.relatedVarieties}
        />
        <RelatedLinkGroup title="Related topics" links={page.relatedTopics} />
      </section>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          FAQ
        </h2>
        <div className="grid gap-3">
          {page.faqs.map((faq) => (
            <article
              key={faq.question}
              className="grid gap-2 rounded-lg border border-border p-4"
            >
              <h3 className="text-base font-semibold text-foreground">
                {faq.question}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {faq.answer}
              </p>
            </article>
          ))}
        </div>
        <Link href="/garden" className={buttonVariants({ className: "w-fit" })}>
          <Sprout className="size-4" />
          Record your plant
        </Link>
      </section>
    </main>
  );
}

function RelatedLinkGroup({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string; description: string }>;
}) {
  return (
    <section className="grid gap-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="grid gap-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="grid gap-2 rounded-lg border border-border p-4 text-sm transition-colors hover:bg-muted"
          >
            <span className="flex items-center gap-2 font-medium text-foreground">
              <ArrowRight className="size-4" />
              {link.label}
            </span>
            <span className="leading-6 text-muted-foreground">
              {link.description}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
