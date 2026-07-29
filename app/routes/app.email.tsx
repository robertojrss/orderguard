import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  buildEligibleEmailList,
  repairOrdersByIds,
  type ShopifyOrder,
} from "../services/email-repair.server";
import { ORDERS_QUERY } from "../services/orders.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "repair") {
    const orderIds = formData.getAll("orderIds") as string[];
    const result = await repairOrdersByIds(admin, orderIds);
    return { type: "repair" as const, ...result };
  }

  const response = await admin.graphql(ORDERS_QUERY);
  const data = await response.json();
  const orders: ShopifyOrder[] = data.data.orders.nodes;
  const eligible = buildEligibleEmailList(orders);

  return {
    type: "scan" as const,
    totalScanned: orders.length,
    eligible: eligible.map(
      ({ order, originalEmail, recommendedEmail, status, warning }) => ({
        id: order.id,
        name: order.name,
        originalEmail,
        recommendedEmail,
        status,
        warning,
      }),
    ),
  };
};

const RISK_LABEL: Record<string, string> = {
  valid: "🟢 Válido",
  corrected: "🟡 Typo corrigido",
  disposable: "🟠 Descartável",
  invalid: "🔴 Inválido",
};

export default function EmailPage() {
  const scanFetcher = useFetcher<typeof action>();
  const repairFetcher = useFetcher<typeof action>();

  const isScanning = scanFetcher.state !== "idle";
  const isRepairing = repairFetcher.state !== "idle";

  const scanResult =
    scanFetcher.data?.type === "scan" ? scanFetcher.data : null;
  const repairResult =
    repairFetcher.data?.type === "repair" ? repairFetcher.data : null;

  const repairableCount =
    scanResult?.eligible.filter((o) => o.status === "corrected").length ?? 0;

  return (
    <s-page heading="Order Repair">
      <s-section heading="📧 Email Validator">
        <s-paragraph>
          Scans store orders and detects emails with typos, invalid formats,
          or disposable domains that could impact delivery notifications.
        </s-paragraph>

        <div style={{ marginTop: 16, marginBottom: 20 }}>
          <scanFetcher.Form method="post">
            <input type="hidden" name="intent" value="scan" />
            <s-button type="submit" disabled={isScanning}>
              {isScanning ? "Analyzing..." : "Analyze Orders"}
            </s-button>
          </scanFetcher.Form>
        </div>

        {scanResult && (
          <>
            <hr
              style={{
                border: "none",
                borderTop: "1px solid #e1e3e5",
                margin: "20px 0",
              }}
            />
            <s-paragraph>
              <strong>{scanResult.totalScanned}</strong> orders analyzed.{" "}
              <strong>{scanResult.eligible.length}</strong> with issues.{" "}
              <strong>{repairableCount}</strong> can be auto-corrected.
            </s-paragraph>
          </>
        )}

        {scanResult && scanResult.eligible.length > 0 && (
          <repairFetcher.Form method="post">
            <input type="hidden" name="intent" value="repair" />
            <div style={{ marginTop: 24 }}>
              <s-table>
                <s-table-header-row>
                  <s-table-header></s-table-header>
                  <s-table-header>Order</s-table-header>
                  <s-table-header>Current Email</s-table-header>
                  <s-table-header>Suggestion</s-table-header>
                  <s-table-header>Delivery Risk</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {scanResult.eligible.map((o) => (
                    <s-table-row key={o.id}>
                      <s-table-cell>
                        {o.status === "corrected" ? (
                          <input
                            type="checkbox"
                            name="orderIds"
                            value={o.id}
                            defaultChecked
                          />
                        ) : (
                          "-"
                        )}
                      </s-table-cell>
                      <s-table-cell>{o.name}</s-table-cell>
                      <s-table-cell>{o.originalEmail}</s-table-cell>
                      <s-table-cell>{o.recommendedEmail ?? "-"}</s-table-cell>
                      <s-table-cell>{RISK_LABEL[o.status]}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </div>

            <div style={{ marginTop: 16 }}>
              <s-button
                type="submit"
                disabled={isRepairing || repairableCount === 0}
              >
                {isRepairing ? "Repairing..." : "Repair selected"}
              </s-button>
            </div>
          </repairFetcher.Form>
        )}

        {repairResult && (
          <>
            <hr
              style={{
                border: "none",
                borderTop: "1px solid #e1e3e5",
                margin: "20px 0",
              }}
            />
            <s-paragraph>
              <strong>{repairResult.succeeded.length}</strong> orders repaired
              successfully.
            </s-paragraph>
            {repairResult.stoppedAt && (
              <s-paragraph>
                Stopped at order <strong>{repairResult.stoppedAt.name}</strong>
                : {repairResult.stoppedAt.error}
              </s-paragraph>
            )}
          </>
        )}
      </s-section>
    </s-page>
  );
}