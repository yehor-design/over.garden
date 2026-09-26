import { LEGAL_BUNDLE_VERSION } from "../../src/lib/legal/legal-documents";

/**
 * The receipt a sign-up writes (ADR-0038 D2), for an account a spec inserts
 * straight into the database. Without it the proxy sends the account to the
 * acceptance screen and every write it makes is refused, which is right for a
 * real account and never what a spec about something else means to test.
 */
export async function acceptLegalDocuments(
  pool: { query: (text: string, values: unknown[]) => Promise<unknown> },
  userId: string,
) {
  await pool.query(
    `insert into legal_acceptances (owner_user_id, bundle_version, source)
     values ($1::uuid, $2::text, 'sign_up')
     on conflict (owner_user_id, bundle_version) do nothing`,
    [userId, LEGAL_BUNDLE_VERSION],
  );
}
