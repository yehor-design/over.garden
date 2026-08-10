"use client";

import Dexie from "dexie";
import { useCallback, useEffect, useState } from "react";

import type { InterfaceLocale } from "@/lib/interface-localization";
import { eraseCurrentDeviceOwnerVault } from "@/lib/offline/owner-vault-migration";
import { offlineDb } from "@/lib/offline/queue";
import {
  activatePhysicalOwnerVault,
  deactivatePhysicalOwnerVault,
  offlineOwnerVaultDatabaseName,
  OWNER_VAULT_CONTROL_DATABASE,
  resolveOwnerOfflineDatabase,
  withOwnerVaultWriterLease,
} from "@/lib/offline/owner-vault";
import { getTrustSurfaceCopy } from "@/lib/trust-surface-copy";

const OWNER_A = "00000000-0000-4000-8000-0000000000a1";
const OWNER_B = "00000000-0000-4000-8000-0000000000b2";
const BINDING_A = "V".repeat(43);
const BINDING_B = "W".repeat(43);

export function OwnerVaultVisualFixture({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const copy = getTrustSurfaceCopy(locale).erasure.localCleanup;
  const [counts, setCounts] = useState({ ownerA: 0, ownerB: 0 });
  const [offlineState, setOfflineState] = useState<"ready" | "degraded">(
    "ready",
  );
  const [erasureState, setErasureState] = useState<
    "idle" | "erased_confirmed" | "erasure_unconfirmed"
  >("idle");
  const [serverActionCount, setServerActionCount] = useState(0);

  const refresh = useCallback(async () => {
    const ownerA = resolveOwnerOfflineDatabase(OWNER_A);
    const ownerB = resolveOwnerOfflineDatabase(OWNER_B);
    setCounts({
      ownerA: ownerA ? await ownerA.drafts.count() : 0,
      ownerB: ownerB ? await ownerB.drafts.count() : 0,
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      activatePhysicalOwnerVault(OWNER_A, BINDING_A),
      activatePhysicalOwnerVault(OWNER_B, BINDING_B),
    ]).then(() => {
      if (!disposed) void refresh();
    });
    return () => {
      disposed = true;
      void deactivatePhysicalOwnerVault(OWNER_A);
      void deactivatePhysicalOwnerVault(OWNER_B);
    };
  }, [refresh]);

  const seed = async () => {
    await Promise.all([
      activatePhysicalOwnerVault(OWNER_A, BINDING_A),
      activatePhysicalOwnerVault(OWNER_B, BINDING_B),
    ]);
    await withOwnerVaultWriterLease(OWNER_A, (database) =>
      database.drafts.put(fixtureDraft(OWNER_A, "sentinel-a", "private-a")),
    );
    await withOwnerVaultWriterLease(OWNER_B, (database) =>
      database.drafts.put(fixtureDraft(OWNER_B, "sentinel-b", "private-b")),
    );
    await offlineDb?.drafts.bulkPut([
      fixtureDraft(OWNER_A, "legacy-a", "legacy-private-a"),
      fixtureDraft(OWNER_B, "legacy-b", "legacy-private-b"),
    ]);
    setOfflineState("ready");
    setErasureState("idle");
    await refresh();
  };

  const retainAcrossSignOut = async () => {
    await deactivatePhysicalOwnerVault(OWNER_A);
    await activatePhysicalOwnerVault(OWNER_A, BINDING_A);
    await refresh();
  };

  const degradeOfflineOnly = async () => {
    await deactivatePhysicalOwnerVault(OWNER_A);
    setOfflineState("degraded");
    await refresh();
  };

  const eraseOwnerA = async () => {
    if (!offlineDb) {
      setErasureState("erasure_unconfirmed");
      return;
    }
    const receipt = await eraseCurrentDeviceOwnerVault({
      ownerUserId: OWNER_A,
      binding: BINDING_A,
      legacy: offlineDb,
    });
    setErasureState(receipt.status);
    await refresh();
  };

  const reset = async () => {
    await Promise.all([
      deactivatePhysicalOwnerVault(OWNER_A),
      deactivatePhysicalOwnerVault(OWNER_B),
    ]);
    await Promise.all([
      Dexie.delete(offlineOwnerVaultDatabaseName(BINDING_A)),
      Dexie.delete(offlineOwnerVaultDatabaseName(BINDING_B)),
      Dexie.delete(OWNER_VAULT_CONTROL_DATABASE),
    ]);
    if (offlineDb) {
      await Promise.all([
        offlineDb.drafts.where("ownerUserId").equals(OWNER_A).delete(),
        offlineDb.drafts.where("ownerUserId").equals(OWNER_B).delete(),
      ]);
    }
    await Promise.all([
      activatePhysicalOwnerVault(OWNER_A, BINDING_A),
      activatePhysicalOwnerVault(OWNER_B, BINDING_B),
    ]);
    setOfflineState("ready");
    setErasureState("idle");
    await refresh();
  };

  return (
    <main lang={locale} className="mx-auto grid max-w-2xl gap-5 p-6">
      <h1 className="text-2xl font-semibold">OVE-288 owner vault fixture</h1>
      <p data-owner-vault-localized-scope="true">{copy.description}</p>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt>Owner A rows</dt>
          <dd data-owner-a-count="true">{counts.ownerA}</dd>
        </div>
        <div>
          <dt>Owner B rows</dt>
          <dd data-owner-b-count="true">{counts.ownerB}</dd>
        </div>
      </dl>
      <p data-owner-vault-offline-state="true">{offlineState}</p>
      <p data-owner-vault-erasure-state="true">{erasureState}</p>
      <p data-server-action-count="true">{serverActionCount}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void reset()}>
          Reset fixture
        </button>
        <button type="button" onClick={() => void seed()}>
          Seed isolated owners
        </button>
        <button type="button" onClick={() => void retainAcrossSignOut()}>
          Retain owner A across sign-out
        </button>
        <button type="button" onClick={() => void degradeOfflineOnly()}>
          Deny offline binding
        </button>
        <button
          type="button"
          onClick={() => setServerActionCount((count) => count + 1)}
        >
          Server-backed private action
        </button>
        <button type="button" onClick={() => void eraseOwnerA()}>
          {copy.action}
        </button>
      </div>
    </main>
  );
}

function fixtureDraft(ownerUserId: string, id: string, body: string) {
  return {
    ownerUserId,
    id,
    kind: "first_entry" as const,
    payload: {
      body,
      photo: new Blob([`${body}-blob`], { type: "image/webp" }),
    },
    createdAt: 1,
    updatedAt: 1,
  };
}
