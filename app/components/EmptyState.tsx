import type { ReactNode } from "react";
import { Link } from "react-router";

interface EmptyStateProps {
  /** Emoji or short glyph shown above the heading. Keep it to a single character/emoji. */
  icon?: string;
  /** Short heading, e.g. "No scans yet" */
  heading: string;
  /** Explains why the page is empty right now. */
  whyEmpty: string;
  /** Explains what the merchant will see once they act. */
  whatHappensNext: string;
  /** Primary call to action. Provide either `href` (internal link) or `onAction`. */
  ctaLabel: string;
  href?: string;
  onAction?: () => void;
  /** Optional extra content rendered below the CTA (e.g. a secondary link). */
  children?: ReactNode;
}

/**
 * A single, reusable empty state used across every module page (Health Checker,
 * Email Validator, Address Formatter, Tax ID Sync, ...) so merchants never hit a
 * blank page. Explains why it's empty, what happens after running the action,
 * and gives a clear CTA.
 */
export function EmptyState({
  icon = "✨",
  heading,
  whyEmpty,
  whatHappensNext,
  ctaLabel,
  href,
  onAction,
  children,
}: EmptyStateProps) {
  const button = (
    <s-button variant="primary" {...(onAction ? { onClick: onAction } : {})}>
      {ctaLabel}
    </s-button>
  );

  return (
    <s-section>
      <s-box padding="large-200">
        <s-stack direction="block" gap="base" alignItems="center">
          <s-text type="strong" fontSize="large">
            {icon}
          </s-text>

          <s-heading>{heading}</s-heading>

          <s-box maxInlineSize="480px">
            <s-stack direction="block" gap="small-200" alignItems="center">
              <s-paragraph color="subdued" alignment="center">
                {whyEmpty}
              </s-paragraph>
              <s-paragraph color="subdued" alignment="center">
                {whatHappensNext}
              </s-paragraph>
            </s-stack>
          </s-box>

          <s-box paddingBlockStart="small">
            {href ? <Link to={href}>{button}</Link> : button}
          </s-box>

          {children}
        </s-stack>
      </s-box>
    </s-section>
  );
}
