import isEmail from "validator/lib/isEmail";
import { parse } from "tldts";

import type {
  ShopifyOrder,
} from "./orders.server";

import type {
  GraphqlClient,
  RepairResult,
  RepairSuccess,
} from "./repair-engine.server";

/**
 * -----------------------------------------------------------------------
 * Email status
 * -----------------------------------------------------------------------
 * "corrected"  - a single, near-certain edit away from a known provider,
 *                confident enough to apply automatically. With the default
 *                thresholds below (CORRECTED_MAX_DISTANCE = 0) this status
 *                is never produced by typo detection — every typo match is
 *                "suspicious" instead, so nothing gets rewritten without a
 *                merchant confirming it. Raise CORRECTED_MAX_DISTANCE if
 *                you want a subset of typos to auto-apply again.
 * "suspicious" - a plausible typo. A suggestion + confidence score is
 *                returned; the merchant must confirm before it's used.
 * "disposable" - matches a known temporary/throwaway email provider.
 * "invalid"    - fails structural validation (no usable local part or
 *                domain, malformed sequences, etc).
 * "valid"      - nothing suspicious detected.
 * -----------------------------------------------------------------------
 */
export type EmailStatus =
  | "invalid"
  | "corrected"
  | "suspicious"
  | "disposable"
  | "valid";

export interface EligibleEmailOrder {
  order: ShopifyOrder;
  originalEmail: string;
  recommendedEmail: string | null;
  status: EmailStatus;
  warning?: string;
  /** 0-100 confidence that `recommendedEmail` is what the customer meant. Only set for "corrected" / "suspicious". */
  confidence?: number;
  /** Human-readable explanation for merchant-facing UI, e.g. "Known provider typo (Levenshtein distance = 1)". */
  reason?: string;
}

/* -------------------------------------------------------------------------
 * Configuration — kept easy to extend, per the design doc.
 * ---------------------------------------------------------------------- */

/** Well known, high-volume email providers. Reference set for typo detection. */
export const KNOWN_PROVIDERS: string[] = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "aol.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "globo.com",
  "usp.br",
  "gov.br",
  "zoho.com",
  "fastmail.com",
  "hey.com",
  "mail.com",
  "gmx.com",
  "gmx.de",
  "qq.com",
  "163.com",
  "126.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "yandex.com",
  "yandex.ru",
  "bk.ru",
  "inbox.ru",
  "rambler.ru",
];

/** O(1) membership check for the exact-match step. Derived from KNOWN_PROVIDERS. */
const KNOWN_PROVIDERS_SET = new Set(KNOWN_PROVIDERS);

/** Domain suffixes that are inherently trustworthy (corporate/education/government) and skip typo detection entirely. */
const TRUSTED_SUFFIXES = [
  ".gov",
  ".gov.br",
  ".edu",
  ".edu.br",
  ".mil",
  ".ac.br",
  ".org.br",
  ".com.br",
  ".net.br",
];

/** Known disposable / throwaway email providers. Extend as new ones surface. */
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "tempmail.com",
  "guerrillamail.com",
  "mailinator.com",
  "trashmail.com",
  "yopmail.com",
  "throwawaymail.com",
  "getnada.com",
  "dispostable.com",
  "sharklasers.com",
  "fakeinbox.com",
]);

/**
 * Typo-detection thresholds.
 *   - CORRECTED_MAX_DISTANCE: raw edit distance at/below which a match is
 *     considered certain enough to auto-apply. Set to 0 (default) to
 *     disable automatic repair entirely — every typo match becomes
 *     "suspicious" and requires merchant confirmation. A legitimate
 *     address like "empresa@gmail.cm" is rare but real, so we don't
 *     silently rewrite anyone's email; the merchant always signs off.
 *   - SUSPICIOUS_MAX_DISTANCE: raw edit distance at/below which a match is
 *     still worth flagging.
 *   - LABEL_MAX_DISTANCE: like SUSPICIOUS_MAX_DISTANCE, but applied to just
 *     the part before the first dot (e.g. "gmial" in "gmial.com"). This is
 *     the pre-filter that stops us from comparing an unrelated domain like
 *     "empresa.com" against every provider in the list — a candidate only
 *     gets a full-domain comparison if its name already looks close.
 *   - MIN_SUSPICIOUS_CONFIDENCE: normalized-distance floor below which a
 *     "close" match is treated as coincidence rather than a typo (mostly
 *     matters for very short domains/providers, e.g. "qq.com", "bk.ru").
 */
const CORRECTED_MAX_DISTANCE = 0;
const SUSPICIOUS_MAX_DISTANCE = 3;
const LABEL_MAX_DISTANCE = 3;
const MIN_SUSPICIOUS_CONFIDENCE = 0.6;

/* -------------------------------------------------------------------------
 * Small helpers
 * ---------------------------------------------------------------------- */

function isEmpty(value: string | null | undefined) {
  return value === null || value === undefined || value.trim() === "";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase().normalize("NFC");
}

function splitEmail(email: string): { local: string; domain: string } | null {
  const atIndex = email.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === email.length - 1) return null;

  return {
    local: email.slice(0, atIndex),
    domain: email.slice(atIndex + 1),
  };
}

/**
 * Standard iterative Levenshtein distance (single-row DP).
 * Dependency-free by design — swap for `fastest-levenshtein` if that
 * package is already part of the project's dependency graph.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i++) {
    const currentRow = [i + 1];

    for (let j = 0; j < b.length; j++) {
      const insertCost = currentRow[j] + 1;
      const deleteCost = previousRow[j + 1] + 1;
      const substituteCost = previousRow[j] + (a[i] === b[j] ? 0 : 1);

      currentRow.push(Math.min(insertCost, deleteCost, substituteCost));
    }

    previousRow = currentRow;
  }

  return previousRow[b.length];
}

function similarityConfidence(distance: number, a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);

  if (maxLength === 0) return 0;

  return Math.max(0, 1 - distance / maxLength);
}

function isDisposable(domain: string) {
  return DISPOSABLE_DOMAINS.has(domain);
}

function isTrustedSuffix(domain: string) {
  return TRUSTED_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

function hasValidDomain(email: string) {
  const parsed = parse(email);
  return Boolean(parsed.domain);
}

/** The part before the first dot, e.g. "gmial" for "gmial.com", "gmailcom" for "gmailcom" (no dot). */
function domainLabel(domain: string) {
  const dotIndex = domain.indexOf(".");
  return dotIndex === -1 ? domain : domain.slice(0, dotIndex);
}

/**
 * Compares `domain` against KNOWN_PROVIDERS and returns the closest match.
 *
 * Two-stage comparison: first the domain's label (the name before the
 * first dot) must be reasonably close to a provider's label — this is what
 * stops "empresa.com" from ever being compared meaningfully against
 * "icloud.com" or "gmail.com" just because both are short strings. Only
 * candidates that pass this pre-filter get a full-domain distance
 * calculation, which is what actually catches TLD-only typos like
 * "gmail.cm" (label "gmail" matches exactly; the full domain differs by
 * one character).
 */
function findClosestProvider(domain: string) {
  const label = domainLabel(domain);
  let best: { provider: string; distance: number; confidence: number } | null = null;

  for (const provider of KNOWN_PROVIDERS) {
    const labelDistance = levenshteinDistance(label, domainLabel(provider));

    if (labelDistance > LABEL_MAX_DISTANCE) continue;

    const distance = levenshteinDistance(domain, provider);

    if (best === null || distance < best.distance) {
      best = {
        provider,
        distance,
        confidence: similarityConfidence(distance, domain, provider),
      };
    }
  }

  return best;
}

/* -------------------------------------------------------------------------
 * Core evaluation pipeline
 * ---------------------------------------------------------------------- */

interface EmailEvaluation {
  recommendedEmail: string | null;
  status: EmailStatus;
  warning?: string;
  confidence?: number;
  reason?: string;
}

function evaluateEmail(email: string): EmailEvaluation {
  // Step 1: normalize
  const normalized = normalizeEmail(email);

  // Step 2: syntax validation. `require_tld: false` on purpose — a missing
  // dot (e.g. "user@gmailcom") is exactly the kind of typo Step 5 should
  // catch, not something we reject outright before we get there.
  const structurallyValid = isEmail(normalized, { require_tld: false });

  if (!structurallyValid) {
    return {
      recommendedEmail: null,
      status: "invalid",
      warning: "Invalid email format",
    };
  }

  // Step 3: extract domain
  const parts = splitEmail(normalized);

  if (!parts) {
    return {
      recommendedEmail: null,
      status: "invalid",
      warning: "Invalid email format",
    };
  }

  const { local, domain } = parts;

  // Disposable providers — unchanged behavior, just a longer list.
  if (isDisposable(domain)) {
    return {
      recommendedEmail: null,
      status: "disposable",
      warning: "Disposable email provider",
    };
  }

  // Corporate / educational / government domains are trusted outright and
  // skip typo detection (a short org name could otherwise land close to a
  // known consumer provider by coincidence).
  if (isTrustedSuffix(domain)) {
    return {
      recommendedEmail: normalized,
      status: "valid",
    };
  }

  // Step 4 + 6: exact match against the known provider list.
  if (KNOWN_PROVIDERS_SET.has(domain)) {
    return {
      recommendedEmail: normalized,
      status: "valid",
    };
  }

  // Step 5: similarity detection against known providers, replacing the
  // old static commonMistakes dictionary.
  const closest = findClosestProvider(domain);

  if (
    closest &&
    closest.distance > 0 &&
    closest.distance <= SUSPICIOUS_MAX_DISTANCE &&
    closest.confidence >= MIN_SUSPICIOUS_CONFIDENCE
  ) {
    const confidencePercent = Math.round(closest.confidence * 100);
    const reason = `Known provider typo (Levenshtein distance = ${closest.distance})`;

    if (closest.distance <= CORRECTED_MAX_DISTANCE) {
      return {
        recommendedEmail: `${local}@${closest.provider}`,
        status: "corrected",
        warning: "Possible domain typo detected",
        confidence: confidencePercent,
        reason,
      };
    }

    return {
      recommendedEmail: `${local}@${closest.provider}`,
      status: "suspicious",
      warning: "Possible domain typo detected — confirmation required",
      confidence: confidencePercent,
      reason,
    };
  }

  // No close typo match — fall back to plain domain-existence validation.
  if (!hasValidDomain(normalized)) {
    return {
      recommendedEmail: null,
      status: "invalid",
      warning: "Invalid email domain",
    };
  }

  return {
    recommendedEmail: normalized,
    status: "valid",
  };
}

/* -------------------------------------------------------------------------
 * Public API (signatures unchanged)
 * ---------------------------------------------------------------------- */

export function buildEligibleEmailList(orders: ShopifyOrder[]): EligibleEmailOrder[] {
  const eligible: EligibleEmailOrder[] = [];

  for (const order of orders) {
    if (isEmpty(order.email)) continue;

    const result = evaluateEmail(order.email!);

    if (result.status === "valid" && result.recommendedEmail === order.email) {
      continue;
    }

    eligible.push({
      order,
      originalEmail: order.email!,
      recommendedEmail: result.recommendedEmail,
      status: result.status,
      warning: result.warning,
      confidence: result.confidence,
      reason: result.reason,
    });
  }

  return eligible;
}

export const ORDERS_BY_ID_QUERY = `#graphql
query getOrdersByIdsForEmailRepair($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Order {
      id
      name
      email
    }
  }
}
`;

export const ORDER_UPDATE_MUTATION = `#graphql
mutation repairOrderEmail($input: OrderInput!) {
  orderUpdate(input: $input) {
    order {
      id
      name
      email
    }
    userErrors {
      field
      message
    }
  }
}
`;

function buildOrderUpdateInput(order: ShopifyOrder, email: string) {
  return {
    id: order.id,
    email,
  };
}

function parseOrderNodes(nodes: unknown[]): ShopifyOrder[] {
  return (nodes as (ShopifyOrder | null)[]).filter(
    (node): node is ShopifyOrder => node !== null,
  );
}

export async function repairOrdersByIds(
  admin: GraphqlClient,
  orderIds: string[],
): Promise<RepairResult> {
  if (orderIds.length === 0) {
    return {
      succeeded: [],
      stoppedAt: null,
    };
  }

  const response = await admin.graphql(ORDERS_BY_ID_QUERY, {
    variables: { ids: orderIds },
  });

  const data = await response.json();

  const orders = parseOrderNodes(data.data.nodes);

  // Only "corrected" matches are safe to apply automatically. With the
  // default thresholds (CORRECTED_MAX_DISTANCE = 0) this never matches
  // anything from typo detection — every suggestion goes through
  // buildEligibleEmailList as "suspicious" and needs merchant confirmation
  // before anything gets rewritten. This filter exists so that raising
  // CORRECTED_MAX_DISTANCE later "just works" without touching this loop.
  const eligible = buildEligibleEmailList(orders).filter(
    (item) => item.status === "corrected" && item.recommendedEmail,
  );

  const succeeded: RepairSuccess[] = [];

  for (const item of eligible) {
    const input = buildOrderUpdateInput(item.order, item.recommendedEmail!);

    const mutationResponse = await admin.graphql(ORDER_UPDATE_MUTATION, {
      variables: { input },
    });

    const result = await mutationResponse.json();

    if (result.errors) {
      return {
        succeeded,
        stoppedAt: {
          id: item.order.id,
          name: item.order.name,
          error: result.errors.map((e: { message: string }) => e.message).join("; "),
        },
      };
    }

    const userErrors = result.data?.orderUpdate?.userErrors ?? [];

    if (userErrors.length > 0) {
      return {
        succeeded,
        stoppedAt: {
          id: item.order.id,
          name: item.order.name,
          error: userErrors.map((e: { message: string }) => e.message).join("; "),
        },
      };
    }

    succeeded.push({
      id: item.order.id,
      name: item.order.name,
    });
  }

  return {
    succeeded,
    stoppedAt: null,
  };
}