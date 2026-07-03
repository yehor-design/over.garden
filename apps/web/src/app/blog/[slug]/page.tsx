import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Sprout } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getBlogPost, listBlogPosts } from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

interface BlogPostRouteProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return listBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: BlogPostRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    const missingState = evaluatePublicSurfaceIndexability({
      kind: "missing",
    });

    return {
      title: "Field note | OverGarden",
      robots: missingState.robots,
    };
  }

  const indexState = evaluatePublicSurfaceIndexability({ kind: post.kind });

  return {
    title: `${post.title} | OverGarden`,
    description: post.description,
    alternates: {
      canonical: post.path,
    },
    robots: indexState.robots,
  };
}

export default async function BlogPostPage({ params }: BlogPostRouteProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) notFound();

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
          <p className="text-sm font-medium text-muted-foreground">
            {formatDate(post.publishedDate)}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {post.title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {post.description}
          </p>
        </div>
      </header>

      <article className="grid gap-7">
        {post.sections.map((section) => (
          <section key={section.heading} className="grid gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {section.heading}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-foreground">
              {section.body}
            </p>
          </section>
        ))}
      </article>

      <section className="grid gap-4 border-t border-border pt-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Related paths
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {post.relatedLinks.map((link) => (
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
