import { useState } from "react";
import { useNavigate } from "react-router";
import { OnboardingStep } from "./OnboardingStep";

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
// Smallest possible persistence: a localStorage flag, scoped per shop so two
// stores signed in on the same browser don't share onboarding state. If the
// app already has a settings table / shop metafield, swap the three helpers
// below for calls into that instead — nothing else in this file needs to change.

const STORAGE_PREFIX = "orderRepair:onboardingComplete";

function storageKey(shop?: string) {
  return shop ? `${STORAGE_PREFIX}:${shop}` : STORAGE_PREFIX;
}

export function hasCompletedOnboarding(shop?: string): boolean {
  if (typeof window === "undefined") return true; // never flash onboarding during SSR
  try {
    return window.localStorage.getItem(storageKey(shop)) === "true";
  } catch {
    return true;
  }
}

export function markOnboardingComplete(shop?: string) {
  try {
    window.localStorage.setItem(storageKey(shop), "true");
  } catch {
    /* ignore - non-critical */
  }
}

export function resetOnboarding(shop?: string) {
  try {
    window.localStorage.removeItem(storageKey(shop));
  } catch {
    /* ignore - non-critical */
  }
}

// ---------------------------------------------------------------------------
// Tour content
// ---------------------------------------------------------------------------

const TOUR_MODULES = [
  {
    icon: "📧",
    title: "Email Validator",
    description: "Flags invalid addresses and likely typos before they cost you an order confirmation.",
  },
  {
    icon: "📍",
    title: "Address Formatter",
    description: "Cleans up spacing and formatting so shipping labels generate correctly the first time.",
  },
  {
    icon: "🪪",
    title: "Tax ID Sync",
    description:
      "Shopify stores localized tax IDs for customers in many countries. Some shipping software, ERPs, and logistics integrations still expect that ID in a different field — Tax ID Sync copies it over automatically so nothing gets stuck.",
  },
  {
    icon: "🩺",
    title: "Health Checker",
    description:
      "Scans your store and gives you one clear picture: data quality, operational risks, recommendations, and an overall health score.",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OnboardingProps {
  /** Current shop domain, used to namespace persistence. Optional. */
  shop?: string;
  /** Called once the merchant finishes or skips onboarding. */
  onFinish: () => void;
}

const TOTAL_STEPS = 3;

export function Onboarding({ shop, onFinish }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  function finish() {
    markOnboardingComplete(shop);
    onFinish();
  }

  function runFirstHealthCheck() {
    markOnboardingComplete(shop);
    onFinish();
    navigate("/app/health");
  }

  return (
    <s-page heading="Welcome to Order Repair">
      <s-stack direction="block" gap="large-200">
        {/* Progress */}
        <s-stack direction="inline" gap="small-100" alignItems="center">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
<s-box
  key={i}
  inlineSize="32px"
  blockSize="4px"
  borderRadius="base"
  background={i + 1 <= step ? "strong" : "subdued"}
/>
          ))}
          <s-text color="subdued">
            Step {step} of {TOTAL_STEPS}
          </s-text>
        </s-stack>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <s-section>
            <s-stack direction="block" gap="base">
              <s-text color="subdued" type="strong">
                ORDER REPAIR
              </s-text>
              <s-heading>Keep your Shopify customer and shipping data clean — automatically.</s-heading>
              <s-paragraph color="subdued">
                Order Repair scans your orders for the small data problems that quietly cause failed
                deliveries, missed notifications, and support tickets — invalid emails, malformed
                addresses, missing tax IDs — and fixes them for you. No spreadsheets, no manual cleanup.
              </s-paragraph>
              <s-box paddingBlockStart="small">
                <s-stack direction="inline" gap="base">
                  <s-button variant="primary" onClick={() => setStep(2)}>
                    Show me how it works
                  </s-button>
                  <s-button variant="tertiary" onClick={finish}>
                    Skip for now
                  </s-button>
                </s-stack>
              </s-box>
            </s-stack>
          </s-section>
        )}

        {/* Step 2: Quick product tour */}
        {step === 2 && (
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="small-100">
              <s-heading>Four tools, one goal: clean order data</s-heading>
              <s-paragraph color="subdued">
                Each tool focuses on one kind of problem. Run them individually, or let Health Checker
                point you to whichever needs attention first.
              </s-paragraph>
            </s-stack>

            <s-grid gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap="base">
              {TOUR_MODULES.map(module => (
                <s-grid-item key={module.title}>
                  <OnboardingStep icon={module.icon} title={module.title} description={module.description} />
                </s-grid-item>
              ))}
            </s-grid>

            <s-box paddingBlockStart="small">
              <s-stack direction="inline" gap="base">
                <s-button variant="primary" onClick={() => setStep(3)}>
                  Continue
                </s-button>
                <s-button variant="tertiary" onClick={finish}>
                  Skip for now
                </s-button>
              </s-stack>
            </s-box>
          </s-stack>
        )}

        {/* Step 3: First scan */}
        {step === 3 && (
          <s-section>
            <s-stack direction="block" gap="base" alignItems="center">
<s-text type="strong">
  🩺
</s-text>
              <s-heading>Let's see how your store is doing</s-heading>
              <s-box maxInlineSize="480px">
                <s-paragraph color="subdued">
                  Health Checker scans your recent orders and gives you a single score, plus a
                  prioritized list of what to fix first. It takes about a minute and nothing changes
                  until you approve a repair.
                </s-paragraph>
              </s-box>
              <s-box paddingBlockStart="small">
                <s-stack direction="inline" gap="base">
                  <s-button variant="primary" onClick={runFirstHealthCheck}>
                    Run my first Health Check
                  </s-button>
                  <s-button variant="tertiary" onClick={finish}>
                    Maybe later
                  </s-button>
                </s-stack>
              </s-box>
            </s-stack>
          </s-section>
        )}
      </s-stack>
    </s-page>
  );
}
