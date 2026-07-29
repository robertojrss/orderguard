import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { buildInsights } from "../services/insights.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const data = await buildInsights(admin);
  return { type: "scan" as const, ...data };
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e1e3e5",
  borderRadius: 8,
  padding: "16px 20px",
  background: "#ffffff",
};

const cardLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#6d7175",
  marginBottom: 6,
};

const cardValueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 600,
};

const cardSubValueStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#6d7175",
  marginTop: 2,
};

const barRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 10,
};

const barTrackStyle: React.CSSProperties = {
  flex: 1,
  height: 10,
  borderRadius: 6,
  background: "#f1f2f3",
  overflow: "hidden",
};

const barFillStyle = (percentage: number): React.CSSProperties => ({
  width: `${percentage}%`,
  height: "100%",
  borderRadius: 6,
  background: "#5c6ac4",
});

export default function InsightsPage() {
  const fetcher = useFetcher<typeof action>();

  const isLoading = fetcher.state !== "idle";

  const data = fetcher.data?.type === "scan" ? fetcher.data : null;

  const maxRegionOrders = data?.regions[0]?.orders ?? 0;
  const maxCityOrders = data?.topCities[0]?.orders ?? 0;

  return (
    <s-page heading="Store Insights">
      <s-section heading="📊 Overview">
        <s-paragraph>
          Read-only analytics about where your customers are and what they
          buy. This module never edits order data.
        </s-paragraph>

        <div style={{ marginTop: 16, marginBottom: 20 }}>
          <fetcher.Form method="post">
            <s-button type="submit" disabled={isLoading}>
              {isLoading ? "Analyzing..." : "Analyze Orders"}
            </s-button>
          </fetcher.Form>
        </div>

        {data && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <div style={cardStyle}>
              <div style={cardLabelStyle}>Orders analyzed</div>
              <div style={cardValueStyle}>
                {data.summary.totalOrders.toLocaleString("pt-BR")}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={cardLabelStyle}>Top Region</div>
              <div style={cardValueStyle}>
                {data.summary.topRegion?.label ?? "-"}
              </div>
              {data.summary.topRegion && (
                <div style={cardSubValueStyle}>
                  {data.summary.topRegion.percentage}% of orders
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <div style={cardLabelStyle}>Best Selling Product</div>
              <div style={cardValueStyle}>
                {data.summary.bestSellingProduct?.title ?? "-"}
              </div>
              {data.summary.bestSellingProduct && (
                <div style={cardSubValueStyle}>
                  {data.summary.bestSellingProduct.quantity.toLocaleString(
                    "pt-BR",
                  )}{" "}
                  units sold
                </div>
              )}
            </div>
          </div>
        )}

        {data && (
          <>
            <hr
              style={{
                border: "none",
                borderTop: "1px solid #e1e3e5",
                margin: "20px 0",
              }}
            />

            <s-section heading="Region Distribution">
              {data.regions.length === 0 ? (
                <s-paragraph>No region data available.</s-paragraph>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {data.regions.map((region) => (
                    <div key={region.code} style={barRowStyle}>
                      <div style={{ width: 140, fontSize: 14 }}>
                        {region.label}
                      </div>
                      <div style={barTrackStyle}>
                        <div
                          style={barFillStyle(
                            maxRegionOrders > 0
                              ? (region.orders / maxRegionOrders) * 100
                              : 0,
                          )}
                        />
                      </div>
                      <div style={{ width: 90, fontSize: 14, textAlign: "right" }}>
                        {region.percentage}% ({region.orders})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </s-section>

            <hr
              style={{
                border: "none",
                borderTop: "1px solid #e1e3e5",
                margin: "20px 0",
              }}
            />

            <s-section heading="Top Customer Cities">
              {data.topCities.length === 0 ? (
                <s-paragraph>No city data available.</s-paragraph>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {data.topCities.map((city, index) => (
                    <div key={city.city} style={barRowStyle}>
                      <div style={{ width: 24, fontSize: 14, color: "#6d7175" }}>
                        {index + 1}.
                      </div>
                      <div style={{ width: 160, fontSize: 14 }}>{city.city}</div>
                      <div style={barTrackStyle}>
                        <div
                          style={barFillStyle(
                            maxCityOrders > 0
                              ? (city.orders / maxCityOrders) * 100
                              : 0,
                          )}
                        />
                      </div>
                      <div style={{ width: 90, fontSize: 14, textAlign: "right" }}>
                        {city.orders.toLocaleString("pt-BR")} orders
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </s-section>

            <hr
              style={{
                border: "none",
                borderTop: "1px solid #e1e3e5",
                margin: "20px 0",
              }}
            />

            <s-section heading="Products by Region">
              {data.productsByRegion.length === 0 ? (
                <s-paragraph>No product data available.</s-paragraph>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 20,
                    marginTop: 12,
                  }}
                >
                  {data.productsByRegion.map((regionGroup) => (
                    <div
                      key={regionGroup.region}
                      style={{
                        border: "1px solid #e1e3e5",
                        borderRadius: 8,
                        padding: 16,
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 10 }}>
                        {regionGroup.region}
                      </div>

                      {regionGroup.products.map((product, index) => (
                        <div
                          key={product.title}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 14,
                            marginBottom: 6,
                          }}
                        >
                          <span>
                            {index + 1}. {product.title}
                          </span>
                          <span style={{ color: "#6d7175" }}>
                            {product.quantity.toLocaleString("pt-BR")} sales
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </s-section>
          </>
        )}
      </s-section>
    </s-page>
  );
}