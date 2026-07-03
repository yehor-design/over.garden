import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Sprout } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { BLOG_INDEX_PATH, listBlogPosts } from "@/server/public-seo-content";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";

const blogIndexState = evaluatePublicSurfaceIndexability({
  kind: "editorial_blog",
});

export const metadata: Metadata = {
  title: "OverGarden field notes",
  description:
    "Authored OverGarden notes on living plant records, public proof, and safe search discovery.",
  alternates: {
    canonical: BLOG_INDEX_PATH,
  },
  robots: blogIndexState.robots,
};

export default function BlogIndexPage() {
  const posts = listBlogPosts();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <Link
          href="/"
          className="self-start rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
        >
          OverGarden
        </Link>
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <BookOpen className="size-4" />
            Field notes
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Useful public pages before thin public pages.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            OverGarden starts search discovery with authored, proof-oriented
            pages. Public journal and aggregation surfaces earn indexability
            later, after they are safe and useful on their own.
          </p>
        </div>
      </header>

      <section className="grid gap-4">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="grid gap-4 rounded-lg border border-border p-4"
          >
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {formatDate(post.publishedDate)}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {post.title}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {post.excerpt}
              </p>
            </div>
            <Link
              href={post.path}
              className={buttonVariants({
                variant: "outline",
                className: "self-start",
              })}
            >
              Read note
              <ArrowRight className="size-4" />
            </Link>
          </article>
        ))}
      </section>

      <section className="grid gap-3 border-t border-border pt-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Start with one record
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          The product action stays gated: a visitor can read these pages, but
          saving a plant record still happens in the authenticated workspace.
        </p>
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
