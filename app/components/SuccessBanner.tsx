interface SuccessBannerProps {
  /** How many records were fixed, e.g. 24 */
  count: number;
  /** Singular/plural noun for what was fixed, e.g. "order" -> "24 orders repaired" */
  noun: string;
  /** Past-tense verb, defaults to "repaired". Use "updated", "formatted", etc. if clearer. */
  verb?: string;
  /** Optional supporting detail shown under the headline, e.g. "Synced in 3.2s". */
  detail?: string;
}

/**
 * Consistent, satisfying success state shown after any repair module finishes running.
 * Renders "✓ 24 orders repaired" instead of a generic "Repair completed." message.
 */
export function SuccessBanner({ count, noun, verb = "repaired", detail }: SuccessBannerProps) {
  const pluralNoun = count === 1 ? noun : `${noun}s`;

  return (
    <s-banner tone="success">
      <s-stack direction="block" gap="small-100">
        <s-text type="strong" fontSize="large">
          ✓ {count} {pluralNoun} {verb}
        </s-text>
        {detail && <s-text color="subdued">{detail}</s-text>}
      </s-stack>
    </s-banner>
  );
}
