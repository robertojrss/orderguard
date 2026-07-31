import {
  getOrders,
  type ShopifyOrder,
} from "./orders.server";

import type {
  GraphqlClient,
} from "./repair-engine.server";

import {
  isValidPhoneNumber,
  type CountryCode,
} from "libphonenumber-js";

// ---------------------------------------------------------------------------
// ARCHITECTURE NOTE
// ---------------------------------------------------------------------------
// This file is now an orchestrator, not a set of ad-hoc checks. Every health
// category (email, phone, address, ...) is a "HealthModule" that knows how to
// score itself, explain itself in merchant language, and point to the repair
// tool that fixes it. buildHealthReport() just runs every registered module
// and combines the results using each module's weight.
//
// To add a new category in the future (e.g. once a dedicated CPF/tax-document
// module exists), write one more `HealthModule` object below and add it to
// `HEALTH_MODULES`. Nothing else in this file needs to change — the score,
// the recommendations engine, and the issue feed all aggregate automatically.
//
// Weighted model (must sum to 1):
//   email                    0.25
//   address                  0.25
//   phone                    0.20
//   customer                 0.15
//   shippingCompatibility    0.10  (stub — not implemented yet, see below)
//   orderMetadata            0.05  (stub — not implemented yet, see below)
// ---------------------------------------------------------------------------

export interface HealthCheckOptions {
  limit: number;
  lastDays?: number;
}

export type HealthStatus = "healthy" | "attention" | "critical";

/**
 * Business-impact severity. This drives what shows up first in the "Top
 * Operational Risks" feed and is independent of a category's 0-100 score.
 *
 *   critical -> missing/invalid email, missing/incomplete shipping address
 *   high     -> missing phone, disposable email
 *   medium   -> suspicious email domain (likely typo), incomplete customer info
 *   low      -> pure formatting/spacing issues (reserved for future checks)
 */
export type IssueSeverity = "critical" | "high" | "medium" | "low";

export interface ValidationCheck {
  label: string;
  count: number;
}

export interface HealthFinding {
  id: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  affectedOrders: number;
  /** Short, merchant-facing bullet points — never technical jargon. */
  businessImpact: string[];
  suggestedAction: string;
  repairUrl: string;
  automaticRepairAvailable: boolean;
  /** Health Score points regained if this specific issue is fixed. */
  estimatedImprovement: number;
}

export interface HealthCategory {
  key: string;
  label: string;
  weight: number;
  score: number;
  status: HealthStatus;
  issueCount: number;
  affectedOrders: number;
  /** One-sentence "so what" for the category card. */
  businessImpact: string;
  validationSummary: ValidationCheck[];
  findings: HealthFinding[];
  repairUrl: string;
  /** Health Score points regained if every issue in this category is fixed. */
  estimatedImprovement: number;
  lastScannedAt: string;
}

/**
 * Known categories keep typed access (report.categories.email.score still
 * works), while the index signature lets future modules plug in without a
 * breaking type change.
 */
export interface HealthCategories {
  customer: HealthCategory;
  email: HealthCategory;
  phone: HealthCategory;
  address: HealthCategory;
  shippingCompatibility: HealthCategory;
  orderMetadata: HealthCategory;
  [key: string]: HealthCategory;
}

export interface Recommendation {
  title: string;
  description: string;
  estimatedImpact: number;
  affectedOrders: number;
  automaticRepairAvailable: boolean;
  repairUrl: string;
  estimatedRepairTime: string;
  priority: number;
}

export interface HealthReport {
  score: number;
  status: HealthStatus;
  totalOrders: number;
  issuesDetected: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  /** Total Health Score points available if every open issue is fixed. */
  estimatedImprovementIfFixed: number;
  lastScan: string;
  categories: HealthCategories;
  /** Pre-sorted, ready for the "Top Operational Risks" feed. */
  topRisks: HealthFinding[];
  /** Pre-sorted, ready for the "Recommended Next Action" panel. */
  recommendations: Recommendation[];
}

/**
 * Plugin contract every repair module should eventually satisfy so the
 * Health Checker orchestrates validation instead of re-implementing it.
 * `evaluate()` is the single entry point; internally it covers what the
 * product spec describes as score(), validate()/issues(), severity(), and
 * repairURL() — bundled into one object so there's one source of truth per
 * scan instead of five separate calls per module per order.
 */
export interface HealthModule {
  key: string;
  label: string;
  repairUrl: string;
  /** 0–1, all registered modules must sum to 1. */
  weight: number;
  evaluate(orders: ShopifyOrder[]): HealthCategory;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

function calculateCategoryStatus(score: number): HealthStatus {
  if (score >= 90) return "healthy";
  if (score >= 70) return "attention";
  return "critical";
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeFindingId(categoryKey: string, title: string): string {
  return `${categoryKey}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/**
 * Splits a category's total point improvement across its findings,
 * proportional to how many orders each finding affects. Keeps every module
 * below from having to do its own point-splitting math.
 */
function attachEstimatedImprovement(
  findings: Array<Omit<HealthFinding, "estimatedImprovement">>,
  categoryImprovement: number
): HealthFinding[] {
  const totalAffected = findings.reduce((sum, f) => sum + f.affectedOrders, 0);

  return findings.map(finding => ({
    ...finding,
    estimatedImprovement:
      totalAffected > 0
        ? Math.round((finding.affectedOrders / totalAffected) * categoryImprovement)
        : 0,
  }));
}

function estimatedRepairTime(affectedOrders: number): string {
  if (affectedOrders <= 10) return "15 seconds";
  if (affectedOrders <= 50) return "about a minute";
  return "a few minutes";
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "guerrillamail.com",
  "10minutemail.com",
  "yopmail.com",
  "trashmail.com",
]);

// Common one-letter/one-transposition typos of the biggest providers. Not
// exhaustive — the goal is to catch the typos merchants actually see, not to
// re-implement a spellchecker.
const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.con": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
};

type EmailStatus = "valid" | "suspicious" | "disposable" | "missing" | "invalid";

function checkEmail(email: string | null | undefined): EmailStatus {
  if (isEmpty(email)) return "missing";

  const value = email!.trim().toLowerCase();
  const atIndex = value.indexOf("@");

  if (atIndex <= 0 || atIndex === value.length - 1) return "invalid";

  const domain = value.slice(atIndex + 1);
  if (!domain.includes(".")) return "invalid";
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return "disposable";
  if (COMMON_DOMAIN_TYPOS[domain]) return "suspicious";

  return "valid";
}

const EMAIL_MODULE: HealthModule = {
  key: "email",
  label: "Email",
  repairUrl: "/app/email",
  weight: 0.25,
  evaluate(orders) {
    const counts: Record<EmailStatus, number> = {
      valid: 0,
      suspicious: 0,
      disposable: 0,
      missing: 0,
      invalid: 0,
    };

    for (const order of orders) {
      counts[checkEmail(order.email)]++;
    }

    const brokenCount = counts.missing + counts.invalid;
    const deduction =
      brokenCount * 3 + counts.disposable * 2 + counts.suspicious * 1;
    const score = Math.max(100 - deduction, 0);
    const categoryImprovement = Math.round(EMAIL_MODULE.weight * (100 - score));

    const findings = attachEstimatedImprovement(
      [
        ...(brokenCount > 0
          ? [
              {
                id: makeFindingId("email", "missing-or-invalid-email"),
                severity: "critical" as IssueSeverity,
                title: "Some customer emails are missing or unusable",
                description: `${brokenCount} order${brokenCount === 1 ? "" : "s"} ${
                  brokenCount === 1 ? "has" : "have"
                } no email, or one that isn't even shaped like a real address.`,
                affectedOrders: brokenCount,
                businessImpact: [
                  "Order confirmations and shipping updates can't be delivered.",
                  "Tracking notifications will fail silently.",
                ],
                suggestedAction: "Open Email Validator",
                repairUrl: "/app/email",
                automaticRepairAvailable: false,
              },
            ]
          : []),
        ...(counts.disposable > 0
          ? [
              {
                id: makeFindingId("email", "disposable-email"),
                severity: "high" as IssueSeverity,
                title: "Some customers used a disposable email address",
                description: `${counts.disposable} order${
                  counts.disposable === 1 ? "" : "s"
                } used a temporary inbox that likely won't be checked again.`,
                affectedOrders: counts.disposable,
                businessImpact: [
                  "Order updates will almost certainly go unread.",
                  "Marketing and win-back automations lose accuracy.",
                ],
                suggestedAction: "Review flagged orders",
                repairUrl: "/app/email",
                automaticRepairAvailable: false,
              },
            ]
          : []),
        ...(counts.suspicious > 0
          ? [
              {
                id: makeFindingId("email", "suspicious-email"),
                severity: "medium" as IssueSeverity,
                title: "Some emails look like a typo of a common provider",
                description: `${counts.suspicious} order${
                  counts.suspicious === 1 ? "" : "s"
                } used a domain that closely resembles gmail.com, hotmail.com, yahoo.com, or outlook.com.`,
                affectedOrders: counts.suspicious,
                businessImpact: [
                  "These addresses will likely bounce every notification you send.",
                ],
                suggestedAction: "Open Email Validator",
                repairUrl: "/app/email",
                automaticRepairAvailable: false,
              },
            ]
          : []),
      ],
      categoryImprovement
    );

    return {
      key: "email",
      label: "Email",
      weight: EMAIL_MODULE.weight,
      score,
      status: calculateCategoryStatus(score),
      issueCount: brokenCount + counts.disposable + counts.suspicious,
      affectedOrders: brokenCount + counts.disposable + counts.suspicious,
      businessImpact:
        score < 100
          ? "Some customers may never receive order or shipping notifications."
          : "All customer emails look deliverable.",
      validationSummary: [
        { label: "Valid", count: counts.valid },
        { label: "Suspicious (possible typo)", count: counts.suspicious },
        { label: "Disposable", count: counts.disposable },
        { label: "Missing or invalid", count: brokenCount },
      ],
      findings,
      repairUrl: "/app/email",
      estimatedImprovement: categoryImprovement,
      lastScannedAt: nowIso(),
    };
  },
};

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

const PHONE_MODULE: HealthModule = {
  key: "phone",
  label: "Phone",
  repairUrl: "/app/phone",
  weight: 0.2,
  evaluate(orders) {
    let missing = 0;
    let malformed = 0;

    for (const order of orders) {
      const phone = order.shippingAddress?.phone;
      const countryCode = order.shippingAddress?.countryCode as
        | CountryCode
        | undefined;

      if (isEmpty(phone)) {
        missing++;
        continue;
      }

      // Reuses the same phone-number library the Phone Formatter module is
      // built on, so "valid" means the same thing in both places.
      try {
        if (!isValidPhoneNumber(phone!, countryCode)) {
          malformed++;
        }
      } catch {
        malformed++;
      }
    }

    const issues = missing + malformed;
    const score = Math.max(100 - issues * 2, 0);
    const categoryImprovement = Math.round(PHONE_MODULE.weight * (100 - score));

    const findings = attachEstimatedImprovement(
      [
        ...(missing > 0
          ? [
              {
                id: makeFindingId("phone", "missing-phone"),
                severity: "high" as IssueSeverity,
                title: "Some orders have no phone number",
                description: `${missing} order${missing === 1 ? "" : "s"} ${
                  missing === 1 ? "has" : "have"
                } no phone number on the shipping address.`,
                affectedOrders: missing,
                businessImpact: [
                  "SMS delivery updates can't be sent.",
                  "Carriers may reject the label or delay delivery.",
                  "Support has no fast way to reach the customer.",
                ],
                suggestedAction: "Contact the customer to obtain a phone number",
                repairUrl: "",
                automaticRepairAvailable: false,
              },
            ]
          : []),
        ...(malformed > 0
          ? [
              {
                id: makeFindingId("phone", "malformed-phone"),
                severity: "high" as IssueSeverity,
                title: "Some phone numbers can't be delivered to",
                description: `${malformed} order${malformed === 1 ? "" : "s"} ${
                  malformed === 1 ? "has" : "have"
                } a number that doesn't match a valid format for its country.`,
                affectedOrders: malformed,
                businessImpact: [
                  "Delivery notifications may silently fail.",
                  "Carriers may be unable to reach the customer.",
                ],
                suggestedAction: "Open Phone Formatter",
                repairUrl: "/app/phone",
                automaticRepairAvailable: true,
              },
            ]
          : []),
      ],
      categoryImprovement
    );

    return {
      key: "phone",
      label: "Phone",
      weight: PHONE_MODULE.weight,
      score,
      status: calculateCategoryStatus(score),
      issueCount: issues,
      affectedOrders: issues,
      businessImpact:
        issues > 0
          ? "Carriers and SMS notifications may not be able to reach some customers."
          : "All phone numbers look deliverable.",
      validationSummary: [
        { label: "Valid", count: orders.length - issues },
        { label: "Missing", count: missing },
        { label: "Invalid format", count: malformed },
      ],
      findings,
      repairUrl: "/app/phone",
      estimatedImprovement: categoryImprovement,
      lastScannedAt: nowIso(),
    };
  },
};

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

// Brazil is the only country the current Address Formatter / ZIP Repair
// modules special-case (see zip-repair.server.ts). Once that module exports
// a shared `validateZip()`, swap this local regex for that call so both
// places agree on what counts as a valid CEP.
const BR_ZIP_PATTERN = /^\d{5}-?\d{3}$/;

const ADDRESS_MODULE: HealthModule = {
  key: "address",
  label: "Address quality",
  repairUrl: "/app/address",
  weight: 0.25,
  evaluate(orders) {
    let incomplete = 0;
    let badZip = 0;

    for (const order of orders) {
      const address = order.shippingAddress;

      if (
        !address ||
        isEmpty(address.address1) ||
        isEmpty(address.city) ||
        isEmpty(address.zip)
      ) {
        incomplete++;
        continue;
      }

      if (address.countryCode === "BR" && !BR_ZIP_PATTERN.test(address.zip!.trim())) {
        badZip++;
      }
    }

    const issues = incomplete + badZip;
    const score = Math.max(100 - incomplete * 3 - badZip * 2, 0);
    const categoryImprovement = Math.round(ADDRESS_MODULE.weight * (100 - score));

    const findings = attachEstimatedImprovement(
      [
        ...(incomplete > 0
          ? [
              {
                id: makeFindingId("address", "incomplete-address"),
                severity: "critical" as IssueSeverity,
                title: "Some shipping addresses are incomplete",
                description: `${incomplete} order${incomplete === 1 ? "" : "s"} ${
                  incomplete === 1 ? "is" : "are"
                } missing a street, city, or ZIP/postal code.`,
                affectedOrders: incomplete,
                businessImpact: [
                  "Shipping labels may fail to generate.",
                  "Carriers may reject or return the package.",
                  "Fulfillment will likely need manual intervention.",
                ],
                suggestedAction: "Open Address Formatter",
                repairUrl: "/app/address",
                automaticRepairAvailable: false,
              },
            ]
          : []),
        ...(badZip > 0
          ? [
              {
                id: makeFindingId("address", "invalid-zip"),
                severity: "critical" as IssueSeverity,
                title: "Some ZIP/postal codes can't be recognized",
                description: `${badZip} order${badZip === 1 ? "" : "s"} ${
                  badZip === 1 ? "has" : "have"
                } a ZIP code that doesn't match Brazil's CEP format.`,
                affectedOrders: badZip,
                businessImpact: [
                  "Carrier rate and delivery-time calculations may fail.",
                  "Packages risk being routed to the wrong region.",
                ],
                suggestedAction: "Open ZIP Repair",
                repairUrl: "/app/zip",
                automaticRepairAvailable: true,
              },
            ]
          : []),
      ],
      categoryImprovement
    );

    return {
      key: "address",
      label: "Address quality",
      weight: ADDRESS_MODULE.weight,
      score,
      status: calculateCategoryStatus(score),
      issueCount: issues,
      affectedOrders: issues,
      businessImpact:
        issues > 0
          ? "Incomplete or malformed addresses increase failed deliveries and manual fulfillment work."
          : "All shipping addresses look complete and deliverable.",
      validationSummary: [
        { label: "Complete", count: orders.length - issues },
        { label: "Incomplete", count: incomplete },
        { label: "Unrecognized ZIP", count: badZip },
      ],
      findings,
      repairUrl: "/app/address",
      estimatedImprovement: categoryImprovement,
      lastScannedAt: nowIso(),
    };
  },
};

// ---------------------------------------------------------------------------
// Customer information
// ---------------------------------------------------------------------------

const CUSTOMER_MODULE: HealthModule = {
  key: "customer",
  label: "Customer information",
  repairUrl: "/app/customer",
  weight: 0.15,
  evaluate(orders) {
    let missingName = 0;

    for (const order of orders) {
      const address = order.shippingAddress;
      if (!address || isEmpty(address.firstName)) {
        missingName++;
      }
    }

    const score = Math.max(100 - missingName * 2, 0);
    const categoryImprovement = Math.round(CUSTOMER_MODULE.weight * (100 - score));

    const findings = attachEstimatedImprovement(
      missingName > 0
        ? [
            {
              id: makeFindingId("customer", "missing-customer-name"),
              severity: "medium" as IssueSeverity,
              title: "Some customers are missing a first name",
              description: `${missingName} order${missingName === 1 ? "" : "s"} ${
                missingName === 1 ? "has" : "have"
              } no first name on the shipping address.`,
              affectedOrders: missingName,
              businessImpact: [
                "Support replies can't be personalized.",
                "Shipping labels may print with an incomplete name.",
              ],
              suggestedAction: "Review flagged orders",
              repairUrl: "/app/customer",
              automaticRepairAvailable: false,
            },
          ]
        : [],
      categoryImprovement
    );

    return {
      key: "customer",
      label: "Customer information",
      weight: CUSTOMER_MODULE.weight,
      score,
      status: calculateCategoryStatus(score),
      issueCount: missingName,
      affectedOrders: missingName,
      businessImpact:
        missingName > 0
          ? "Some customers are missing basic information, which slows down support and fulfillment."
          : "All orders have complete customer information.",
      validationSummary: [
        { label: "Complete", count: orders.length - missingName },
        { label: "Missing name", count: missingName },
      ],
      findings,
      repairUrl: "/app/customer",
      estimatedImprovement: categoryImprovement,
      lastScannedAt: nowIso(),
    };
  },
};

// ---------------------------------------------------------------------------
// Forward-looking stub modules
// ---------------------------------------------------------------------------
// These exist purely so the weighted model in the spec (100% across six
// categories) is accurate today and no dashboard code has to change when the
// real checks land. Each currently reports a perfect score and zero issues.

function stubModule(key: string, label: string, weight: number): HealthModule {
  return {
    key,
    label,
    repairUrl: "#",
    weight,
    evaluate(orders) {
      return {
        key,
        label,
        weight,
        score: 100,
        status: "healthy",
        issueCount: 0,
        affectedOrders: 0,
        businessImpact: "Not monitored yet — coming soon.",
        validationSummary: [],
        findings: [],
        repairUrl: "#",
        estimatedImprovement: 0,
        lastScannedAt: nowIso(),
      };
    },
  };
}

const SHIPPING_COMPATIBILITY_MODULE = stubModule(
  "shippingCompatibility",
  "Shipping compatibility",
  0.1
);

const ORDER_METADATA_MODULE = stubModule(
  "orderMetadata",
  "Order metadata consistency",
  0.05
);

// ---------------------------------------------------------------------------
// Module registry — add a future module here and nowhere else
// ---------------------------------------------------------------------------

const HEALTH_MODULES: HealthModule[] = [
  EMAIL_MODULE,
  ADDRESS_MODULE,
  PHONE_MODULE,
  CUSTOMER_MODULE,
  SHIPPING_COMPATIBILITY_MODULE,
  ORDER_METADATA_MODULE,
];

// ---------------------------------------------------------------------------
// Recommendations engine
// ---------------------------------------------------------------------------

function buildRecommendations(categories: HealthCategory[]): Recommendation[] {
  return categories
    .filter(category => category.issueCount > 0)
    .map(category => ({
      title: `Fix ${category.label}`,
      description: category.businessImpact,
      estimatedImpact: category.estimatedImprovement,
      affectedOrders: category.affectedOrders,
      automaticRepairAvailable: category.findings.some(f => f.automaticRepairAvailable),
      repairUrl: category.repairUrl,
      estimatedRepairTime: estimatedRepairTime(category.affectedOrders),
      priority: category.estimatedImprovement,
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function buildHealthReport(
  admin: GraphqlClient,
  options: HealthCheckOptions
): Promise<HealthReport> {
  const orders = await getOrders(admin, options);

  const categories = {} as HealthCategories;
  for (const healthModule of HEALTH_MODULES) {
    categories[healthModule.key] = healthModule.evaluate(orders);
  }

  const categoryList = Object.values(categories);

  // Weighted, not averaged: a category's contribution to the overall score
  // is proportional to its configured weight.
  const score = Math.round(
    categoryList.reduce((total, category) => total + category.weight * category.score, 0)
  );

  const allFindings = categoryList.flatMap(category => category.findings);

  const severityRank: Record<IssueSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const topRisks = [...allFindings]
    .sort(
      (a, b) =>
        severityRank[a.severity] - severityRank[b.severity] ||
        b.affectedOrders - a.affectedOrders
    )
    .slice(0, 5);

  return {
    score,
    status: calculateCategoryStatus(score),
    totalOrders: orders.length,
    issuesDetected: allFindings.length,
    criticalIssues: allFindings.filter(f => f.severity === "critical").length,
    highIssues: allFindings.filter(f => f.severity === "high").length,
    mediumIssues: allFindings.filter(f => f.severity === "medium").length,
    lowIssues: allFindings.filter(f => f.severity === "low").length,
    estimatedImprovementIfFixed: Math.round(
      categoryList.reduce((total, category) => total + category.estimatedImprovement, 0)
    ),
    lastScan: nowIso(),
    categories,
    topRisks,
    recommendations: buildRecommendations(categoryList),
  };
}