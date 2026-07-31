import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Onboarding, hasCompletedOnboarding } from "../components/onboarding/Onboarding";
import { getLastHealthCheckResult, daysSince, type HealthCheckResult } from "../utils/health-check-storage";

// ---------------------------------------------------------------------------
// Store health snapshot
// ---------------------------------------------------------------------------
// Read from the last saved Health Checker result (see
// app/utils/health-check-storage.ts). Once /app/health has a loader wired to
// buildHealthReport() server-side, this can be swapped for real loader data
// — the shape (score, issuesDetected, criticalIssues, filter, scannedAt) is
// already the same.

function statusFor(value: number | null) {
  if (value === null) return { tone: "info" as const, label: "Not scanned yet" };
  if (value >= 90) return { tone: "success" as const, label: "Excellent" };
  if (value >= 70) return { tone: "warning" as const, label: "Needs attention" };
  return { tone: "critical" as const, label: "Critical" };
}

function ScoreRing({ value }: { value: number | null }) {
  const size = 148;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = value ?? 0;
  const offset = circumference * (1 - filled / 100);
  const ringColor =
    value === null ? "#c9cccf" : value >= 90 ? "#008060" : value >= 70 ? "#b98900" : "#d82c0d";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={value === null ? "Store health not scanned yet" : `Store health score ${value} out of 100`}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e4e5e7" strokeWidth={stroke} />
      {value !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 700ms ease" }}
        />
      )}
      <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" fontSize="36" fontWeight="700" fill="#1a1a1a">
        {value === null ? "--" : value}
      </text>
      <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#6b6f73">
        / 100
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Repair modules
// ---------------------------------------------------------------------------

type RepairMode = "automatic" | "manual";

interface RepairModule {
  key: string;
  emoji: string;
  title: string;
  description: string;
  href: string;
  mode: RepairMode;
}

const MODE_BADGE: Record<RepairMode, { tone: "success" | "info" | "warning"; label: string }> = {
  automatic: { tone: "success", label: "One-click repair" },
  manual: { tone: "info", label: "Guided review" },
};

const REPAIR_MODULES: RepairModule[] = [
  {
    key: "tax-id",
    emoji: "🪪",
    title: "Tax ID Sync",
    description:
      "Copies each customer's tax identifier — CPF/CNPJ, VAT, NIF, RUC, and more — into the Company field, so labels and invoices carry the right ID no matter the country.",
    href: "/app/cpf",
    mode: "automatic",
  },
  {
    key: "phone",
    emoji: "📞",
    title: "Phone Formatter",
    description:
      "Normalizes customer phone numbers into the international format carriers expect, so delivery texts and calls actually go through.",
    href: "/app/phone",
    mode: "automatic",
  },
  {
    key: "zip",
    emoji: "📦",
    title: "ZIP Code Repair",
    description:
      "Normalizes postal codes to each country's standard format, cutting down on rejected labels and misrouted packages.",
    href: "/app/zip",
    mode: "automatic",
  },
  {
    key: "address",
    emoji: "📍",
    title: "Address Formatter",
    description:
      "Cleans up spacing, apartment numbers, and country-specific formatting so shipping labels generate correctly the first time.",
    href: "/app/address",
    mode: "manual",
  },
  {
    key: "email",
    emoji: "📧",
    title: "Email Validator",
    description:
      "Flags invalid addresses, likely typos, and disposable domains before they cost you an order confirmation.",
    href: "/app/email",
    mode: "manual",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Index() {
  // First-visit detection. `checked` avoids a flash of the dashboard before
  // localStorage has been read on mount (SSR has no window, so we can't know
  // on first render whether onboarding was already completed).
  const [checked, setChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [lastResult, setLastResult] = useState<HealthCheckResult | null>(null);

  useEffect(() => {
    setShowOnboarding(!hasCompletedOnboarding());
    setLastResult(getLastHealthCheckResult());
    setChecked(true);
  }, []);

  if (!checked) {
    return null;
  }

  if (showOnboarding) {
    return <Onboarding onFinish={() => setShowOnboarding(false)} />;
  }

  const score = lastResult?.score ?? null;
  const issuesDetected = lastResult?.issuesDetected ?? null;
  const criticalIssues = lastResult?.criticalIssues ?? null;
  const heroStatus = statusFor(score);
  const scanIsStale = lastResult ? daysSince(lastResult.scannedAt) >= 7 : false;

  return (
    <s-page heading="Order Repair">
      <s-stack direction="block" gap="large-200">
        {/* HERO — everything centered in a single column */}
        <s-section>
          <s-stack direction="block" gap="large-200" alignItems="center">
            <s-text color="subdued" type="strong">
              STORE HEALTH
            </s-text>

            <s-box maxInlineSize="360px">
              <s-stack direction="block" gap="small" alignItems="center">
                <s-heading style={{ textAlign: "center" }}>Your store's data, at a glance</s-heading>

                <s-paragraph color="subdued" style={{ textAlign: "center" }}>
                  Order Repair scans your recent orders for the problems that quietly cause failed
                  deliveries, missed notifications, and support tickets — then tells you exactly
                  what to fix first.
                </s-paragraph>
              </s-stack>
            </s-box>

            <ScoreRing value={score} />

            <s-badge tone={heroStatus.tone} size="large">
              {heroStatus.label}
            </s-badge>

            <s-text color="subdued" style={{ textAlign: "center" }}>
              {issuesDetected === null
                ? "Run your first scan to see where you stand."
                : `${issuesDetected} issue${issuesDetected === 1 ? "" : "s"} detected${
                    criticalIssues ? `, ${criticalIssues} need immediate attention` : ""
                  }.`}
            </s-text>

            {lastResult && (
              <s-box paddingBlockStart="small-200">
                <s-stack direction="block" gap="small-100" alignItems="center">
                  <s-text color="subdued" style={{ textAlign: "center" }}>
                    Based on {lastResult.filter.label.toLowerCase()} ({lastResult.filter.scannedCount} order
                    {lastResult.filter.scannedCount === 1 ? "" : "s"} scanned)
                  </s-text>

                  <s-banner tone={scanIsStale ? "warning" : "info"}>
                    {score !== null && score >= 90
                      ? "A clean score only covers the orders that were scanned — new orders keep coming in. Check again regularly so problems don't pile up unnoticed."
                      : "Results reflect this specific scan, not your whole order history. Check again after fixing issues, or whenever new orders come in."}
                  </s-banner>
                </s-stack>
              </s-box>
            )}

            <s-box paddingBlockStart="small">
              <Link to="/app/health">
                <s-button variant="primary">{lastResult ? "Check again" : "Run store health check"}</s-button>
              </Link>
            </s-box>
          </s-stack>
        </s-section>

        {/* REPAIR TOOLS */}
        <s-stack direction="block" gap="small-100">
          <s-heading>Repair tools</s-heading>
          <s-paragraph color="subdued">
            Six focused tools that keep your order data clean — no manual spreadsheet work.
          </s-paragraph>
        </s-stack>

        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(300px, 1fr))" gap="base">
          {REPAIR_MODULES.map(repairModule => {
            const badge = MODE_BADGE[repairModule.mode];

            return (
              <s-grid-item key={repairModule.key}>
                <s-section heading={`${repairModule.emoji} ${repairModule.title}`}>
                  <s-stack direction="block" gap="base">
                    <s-badge tone={badge.tone}>{badge.label}</s-badge>

                    <s-paragraph color="subdued">{repairModule.description}</s-paragraph>

                    <Link to={repairModule.href}>
                      <s-button variant="primary">Fix {repairModule.title.toLowerCase()}</s-button>
                    </Link>
                  </s-stack>
                </s-section>
              </s-grid-item>
            );
          })}
        </s-grid>

        {/* ANALYTICS — a separate category from the repair tools */}
        <s-stack direction="block" gap="small-100">
          <s-heading>Analytics</s-heading>
          <s-paragraph color="subdued">See the story behind your orders, not just what's broken in them.</s-paragraph>
        </s-stack>

        <s-section heading="📊 Store Insights">
          <s-stack direction="block" gap="base">
            <s-paragraph color="subdued">
              See where customers are buying and which products perform best in each region.
            </s-paragraph>

            <Link to="/app/insights">
              <s-button variant="primary">Open Store Insights</s-button>
            </Link>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}