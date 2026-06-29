import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Leaf, Lock, NotebookPen } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { gardenFirstEntryInvitePath } from "@/lib/garden/public-paths";

export const metadata: Metadata = {
  title: "Your OverGarden invite",
  description:
    "A private invitation to the small OverGarden gardening pilot. Keep a living record of your plants and decide what stays private.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function JoinPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-5 py-10 sm:px-8">
      <Link href="/" className="text-sm text-muted-foreground">
        OverGarden
      </Link>

      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <p className="text-sm font-medium text-muted-foreground">
          Private invite
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          You’re invited to keep a living record of your plants.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          OverGarden is a small, invite-only group of gardeners right now.
          You’ll write a dated note about one real plant, then come back to the
          same plant when something changes, so the useful details are never
          lost in chat threads again.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={gardenFirstEntryInvitePath()}
            className={buttonVariants({ size: "lg" })}
          >
            <Leaf className="size-4" />
            Open my garden
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/privacy"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            How your privacy is handled
          </Link>
        </div>
      </header>

      <section className="grid gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          What to expect
        </h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
              <NotebookPen className="size-4" />
              Start with one plant
            </dt>
            <dd className="text-sm leading-6 text-muted-foreground">
              Add a plant, write your first dated note, and your garden is
              started.
            </dd>
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Lock className="size-4" />
              Private by default
            </dt>
            <dd className="text-sm leading-6 text-muted-foreground">
              Your notes stay private. You only create an account when you
              decide to save.
            </dd>
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <dt className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Leaf className="size-4" />
              Come back anytime
            </dt>
            <dd className="text-sm leading-6 text-muted-foreground">
              Return to the same plant to add what happened next and watch its
              story grow.
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-3 rounded-lg border border-border p-5">
        <h2 className="text-base font-semibold text-foreground">
          This is a calm, closed pilot
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          You’re one of a small invited group helping shape OverGarden. There’s
          nothing public here yet, no pressure to post, and no audience to
          perform for. Save your first plant note whenever it suits you.
        </p>
        <Link
          href={gardenFirstEntryInvitePath()}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Save my first plant note
        </Link>
      </section>
    </main>
  );
}
