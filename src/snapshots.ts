import path from "node:path";
import { atomicWriteJson } from "./atomic.ts";
import { log } from "./logger.ts";
import { QontoApiError, QontoClient } from "./qonto-client.ts";

export interface BankAccount {
  id: string;
  slug?: string;
  iban?: string;
  bic?: string;
  currency?: string;
  balance?: number | string;
  status?: string;
  [key: string]: unknown;
}

export interface OrganizationPayload {
  organization: {
    id: string;
    slug?: string;
    legal_name?: string;
    bank_accounts: BankAccount[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function fetchOrganization(client: QontoClient): Promise<OrganizationPayload> {
  return client.getJson<OrganizationPayload>("organization");
}

export async function writeOrganizationSnapshot(
  backupDir: string,
  payload: OrganizationPayload,
): Promise<void> {
  await atomicWriteJson(path.join(backupDir, "organization.json"), payload);
  log.info("snapshot.organization", {
    bank_accounts: payload.organization?.bank_accounts?.length ?? 0,
  });
}

export async function syncLabels(client: QontoClient, backupDir: string): Promise<void> {
  const labels = await collectAllPages<unknown>(client, "labels", {}, "labels");
  await atomicWriteJson(path.join(backupDir, "labels.json"), { labels });
  log.info("snapshot.labels", { count: labels.length });
}

export async function syncBeneficiaries(client: QontoClient, backupDir: string): Promise<void> {
  const beneficiaries = await collectAllPages<unknown>(client, "beneficiaries", {}, "beneficiaries");
  let international: unknown[] = [];
  try {
    international = await collectAllPages<unknown>(
      client,
      "beneficiaries/international",
      {},
      "beneficiaries",
    );
  } catch (err) {
    if (err instanceof QontoApiError && err.status === 404) {
      log.info("snapshot.beneficiaries.international_not_available", {});
    } else {
      throw err;
    }
  }
  await atomicWriteJson(path.join(backupDir, "beneficiaries.json"), {
    beneficiaries,
    international,
  });
  log.info("snapshot.beneficiaries", {
    count: beneficiaries.length,
    international: international.length,
  });
}

async function collectAllPages<T>(
  client: QontoClient,
  pathname: string,
  query: Record<string, string | number | string[] | undefined>,
  itemsKey: string,
): Promise<T[]> {
  const out: T[] = [];
  for await (const page of client.paginate<T>(pathname, query, itemsKey)) {
    out.push(...page.items);
  }
  return out;
}
