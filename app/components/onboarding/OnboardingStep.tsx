interface OnboardingStepProps {
  icon: string;
  title: string;
  /** One plain-English sentence. No implementation details. */
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
}

/**
 * A single module card inside the onboarding "quick product tour" step.
 * Deliberately minimal — one icon, one title, one sentence, one optional CTA —
 * so the whole tour reads in under 60 seconds.
 */
export function OnboardingStep({ icon, title, description, ctaLabel, onCta }: OnboardingStepProps) {
  return (
    <s-section heading={`${icon} ${title}`}>
      <s-stack direction="block" gap="base">
        <s-paragraph color="subdued">{description}</s-paragraph>
        {ctaLabel && (
          <s-button variant="secondary" onClick={onCta}>
            {ctaLabel}
          </s-button>
        )}
      </s-stack>
    </s-section>
  );
}
