import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  publicLineageObjectPath,
  publicVarietyPath,
} from "@/lib/garden/public-paths";
import {
  getPublicLineageGraphPage,
  type PublicLineageEdge,
  type PublicLineageNode,
} from "@/server/public-lineage-repository";
import { evaluatePublicSurfaceIndexability } from "@/server/public-surface-indexing-policy";
import { getCurrentSession, getSessionId } from "@/server/auth-session";
import { listLineageInteractionTargets } from "@/server/lineage-interactions-repository";
import { resolvePilotWriteAccess } from "@/server/pilot-write-access";
import { scopedToUser } from "@/server/request-scope";
import {
  askLineageQuestionAction,
  followLineageNodeAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface PublicLineageObjectRouteProps {
  params: Promise<{ objectId: string }>;
}

const getCachedPublicLineageGraphPage = cache((objectId: string) =>
  getPublicLineageGraphPage(objectId),
);

export async function generateMetadata({
  params,
}: PublicLineageObjectRouteProps): Promise<Metadata> {
  const { objectId } = await params;
  const page = await getCachedPublicLineageGraphPage(objectId);
  const indexState = evaluatePublicSurfaceIndexability({
    kind: page ? "lineage_graph" : "missing",
  });

  if (!page) {
    return {
      title: "Lineage | OverGarden",
      robots: indexState.robots,
    };
  }

  return {
    title: `${page.root.displayName} lineage | OverGarden`,
    description: `Confirmed public-safe provenance chain for ${page.root.displayName}.`,
    alternates: {
      canonical: publicLineageObjectPath(page.root.plantObjectId),
    },
    robots: indexState.robots,
  };
}

export default async function PublicLineageObjectRoute({
  params,
}: PublicLineageObjectRouteProps) {
  const { objectId } = await params;
  const page = await getCachedPublicLineageGraphPage(objectId);

  if (!page) notFound();

  const nodesById = new Map(
    page.nodes.map((node) => [node.plantObjectId, node]),
  );
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  const scope = userId ? scopedToUser(userId, getSessionId(session)) : null;
  const writeAccess = scope
    ? await resolvePilotWriteAccess(scope)
    : { invited: false };
  const interactionTargets =
    scope && writeAccess.invited
      ? await listLineageInteractionTargets(
          scope,
          page.edges.map((edge) => edge.id),
        )
      : [];
  const interactionTargetsByEdgeId = new Map(
    interactionTargets.map((target) => [target.edgeId, target]),
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-5 border-b border-border pb-6">
        <Link
          href="/"
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          OverGarden
        </Link>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            Lineage graph
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {page.root.displayName}
          </h1>
          <PublicLineageNodeMeta node={page.root} />
        </div>
      </header>

      <section className="grid gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Confirmed provenance
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Public readback is limited to confirmed, active, public-entry-backed
            object links.
          </p>
        </div>

        {page.edges.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No confirmed public lineage is available for this object yet.
          </p>
        ) : (
          <ol className="grid gap-4">
            {page.edges.map((edge) => {
              const subject = nodesById.get(edge.subjectPlantObjectId);
              const source = nodesById.get(edge.sourcePlantObjectId);
              if (!subject || !source) return null;
              const interactionTargetId =
                interactionTargetsByEdgeId.get(edge.id)?.targetPlantObjectId;
              const interactionTarget = interactionTargetId
                ? nodesById.get(interactionTargetId)
                : null;

              return (
                <PublicLineageEdgeCard
                  key={edge.id}
                  edge={edge}
                  subject={subject}
                  source={source}
                  rootPlantObjectId={page.root.plantObjectId}
                  interactionTarget={interactionTarget ?? null}
                />
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}

function PublicLineageEdgeCard({
  edge,
  subject,
  source,
  rootPlantObjectId,
  interactionTarget,
}: {
  edge: PublicLineageEdge;
  subject: PublicLineageNode;
  source: PublicLineageNode;
  rootPlantObjectId: string;
  interactionTarget: PublicLineageNode | null;
}) {
  return (
    <li className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {source.displayName} to {subject.displayName}
        </h3>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border px-2 py-1">
            Depth {edge.depth}
          </span>
          <time className="rounded-md border border-border px-2 py-1">
            {formatDate(edge.createdAt)}
          </time>
        </div>
      </div>

      <dl className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
        <PublicLineageNodeDescription label="Source" node={source} />
        <PublicLineageNodeDescription label="Grown object" node={subject} />
      </dl>

      {interactionTarget ? (
        <LineageInteractionPanel
          edge={edge}
          rootPlantObjectId={rootPlantObjectId}
          target={interactionTarget}
        />
      ) : null}
    </li>
  );
}

function LineageInteractionPanel({
  edge,
  rootPlantObjectId,
  target,
}: {
  edge: PublicLineageEdge;
  rootPlantObjectId: string;
  target: PublicLineageNode;
}) {
  return (
    <div className="grid gap-3 border-t border-border pt-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          Lineage updates from {target.displayName}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Questions stay inside this confirmed chain and must be contact-free.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <form action={followLineageNodeAction}>
          <input type="hidden" name="edgeId" value={edge.id} />
          <input
            type="hidden"
            name="targetPlantObjectId"
            value={target.plantObjectId}
          />
          <input
            type="hidden"
            name="rootPlantObjectId"
            value={rootPlantObjectId}
          />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              className: "w-full md:w-auto",
            })}
          >
            Follow updates
          </button>
        </form>

        <form action={askLineageQuestionAction} className="grid gap-2">
          <input type="hidden" name="edgeId" value={edge.id} />
          <input
            type="hidden"
            name="targetPlantObjectId"
            value={target.plantObjectId}
          />
          <input
            type="hidden"
            name="rootPlantObjectId"
            value={rootPlantObjectId}
          />
          <input
            type="hidden"
            name="clientMutationId"
            value={crypto.randomUUID()}
          />
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-foreground">
              Ask within lineage
            </span>
            <textarea
              name="questionText"
              required
              maxLength={360}
              rows={3}
              placeholder="What should I know about this line?"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
            />
          </label>
          <button
            type="submit"
            className={buttonVariants({ className: "justify-self-start" })}
          >
            Send question
          </button>
        </form>
      </div>
    </div>
  );
}

function PublicLineageNodeDescription({
  label,
  node,
}: {
  label: string;
  node: PublicLineageNode;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs uppercase">{label}</dt>
      <dd className="font-medium text-foreground">{node.displayName}</dd>
      <dd>
        <PublicLineageNodeMeta node={node} compact />
      </dd>
    </div>
  );
}

function PublicLineageNodeMeta({
  node,
  compact = false,
}: {
  node: PublicLineageNode;
  compact?: boolean;
}) {
  const meta = [
    node.varietyText ?? node.catalogCanonicalName ?? "Unknown variety",
    node.safeLocationLabel,
  ].filter(Boolean);

  return (
    <div
      className={`flex flex-wrap gap-2 text-xs text-muted-foreground ${
        compact ? "" : "mt-1"
      }`}
    >
      {meta.map((item) => (
        <span key={item} className="rounded-md border border-border px-2 py-1">
          {item}
        </span>
      ))}
      {node.catalogPublicSlug ? (
        <Link
          href={publicVarietyPath(node.catalogPublicSlug)}
          className="rounded-md border border-border px-2 py-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          {node.catalogCanonicalName ?? "Public variety"}
        </Link>
      ) : null}
    </div>
  );
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
