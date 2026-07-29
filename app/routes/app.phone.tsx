import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  buildEligiblePhoneList,
  repairOrdersByIds,
  type ShopifyOrder,
} from "../services/phone-repair.server";
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
  const eligible = buildEligiblePhoneList(orders);

  return {
    type: "scan" as const,
    totalScanned: orders.length,
    eligible: eligible.map(({ order, originalPhone, recommendedPhone }) => ({
      id: order.id,
      name: order.name,
      originalPhone,
      recommendedPhone,
    })),
  };
};

export default function PhonePage() {
  const scanFetcher = useFetcher<typeof action>();
  const repairFetcher = useFetcher<typeof action>();

  const isScanning = scanFetcher.state !== "idle";
  const isRepairing = repairFetcher.state !== "idle";

  const scanResult =
    scanFetcher.data?.type === "scan" ? scanFetcher.data : null;
  const repairResult =
    repairFetcher.data?.type === "repair" ? repairFetcher.data : null;

  return (
    <s-page heading="Order Repair">
      <s-section heading="📞 Phone Number Formatter">
        <s-paragraph>
          Scans store orders and finds phone numbers that can be normalized
          into a standard international format.
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
            <hr style={{ border: "none", borderTop: "1px solid #e1e3e5", margin: "20px 0" }} />
            <s-paragraph>
              <strong>{scanResult.totalScanned}</strong> orders analyzed.{" "}
              <strong>{scanResult.eligible.length}</strong> eligible.
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
                  <s-table-header>Current Phone</s-table-header>
                  <s-table-header>Recommended Phone</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {scanResult.eligible.map((o) => (
                    <s-table-row key={o.id}>
                      <s-table-cell>
                        <input type="checkbox" name="orderIds" value={o.id} defaultChecked />
                      </s-table-cell>
                      <s-table-cell>{o.name}</s-table-cell>
                      <s-table-cell>{o.originalPhone}</s-table-cell>
                      <s-table-cell>{o.recommendedPhone}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </div>

            <div style={{ marginTop: 16 }}>
              <s-button type="submit" disabled={isRepairing}>
                {isRepairing ? "Repairing..." : "Repair selected"}
              </s-button>
            </div>
          </repairFetcher.Form>
        )}

        {repairResult && (
          <>
            <hr style={{ border: "none", borderTop: "1px solid #e1e3e5", margin: "20px 0" }} />
            <s-paragraph>
              <strong>{repairResult.succeeded.length}</strong> orders repaired
              successfully.
            </s-paragraph>
            {repairResult.stoppedAt && (
              <s-paragraph>
                Stopped at order <strong>{repairResult.stoppedAt.name}</strong>:{" "}
                {repairResult.stoppedAt.error}
              </s-paragraph>
            )}
          </>
        )}
      </s-section>
    </s-page>
  );
}