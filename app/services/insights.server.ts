export interface InsightsShippingAddress {
  city: string | null;
  provinceCode: string | null;
  countryCode: string | null;
}

export interface LineItem {
  title: string;
  quantity: number;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  shippingAddress: InsightsShippingAddress | null;
  lineItems: { nodes: LineItem[] };
}

export interface RegionInsight {
  code: string;
  label: string;
  orders: number;
  percentage: number;
}

export interface CityInsight {
  city: string;
  orders: number;
}

export interface ProductInsight {
  title: string;
  quantity: number;
}

export interface RegionProducts {
  region: string;
  products: ProductInsight[];
}

export interface InsightsSummary {
  totalOrders: number;
  topRegion: { label: string; percentage: number } | null;
  bestSellingProduct: { title: string; quantity: number } | null;
}

export interface InsightsData {
  totalScanned: number;
  summary: InsightsSummary;
  regions: RegionInsight[];
  topCities: CityInsight[];
  productsByRegion: RegionProducts[];
}

// Só nomes de estado do Brasil por enquanto. Pra outros países o código
// da província é usado como label mesmo (ex: "CA", "NY").
const BR_PROVINCE_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

function regionLabel(
  provinceCode: string | null,
  countryCode: string | null,
): string {
  if (!provinceCode) return "Unknown";
  if (countryCode === "BR" && BR_PROVINCE_NAMES[provinceCode]) {
    return BR_PROVINCE_NAMES[provinceCode];
  }
  return provinceCode;
}

// ---------------------------------------------------------------------
// Query e paginação
// ---------------------------------------------------------------------

// Query própria do Insights: precisa de lineItems, que os outros módulos
// não usam, então não faz sentido colocar isso na ORDERS_QUERY compartilhada
// em orders.server.ts (ia deixar as outras queries mais caras à toa).
export const INSIGHTS_ORDERS_QUERY = `#graphql
  query getOrdersForInsights($cursor: String) {
    orders(first: 250, after: $cursor, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        shippingAddress {
          city
          provinceCode
          countryCode
        }
        lineItems(first: 50) {
          nodes {
            title
            quantity
          }
        }
      }
    }
  }
`;

type GraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, any> },
  ) => Promise<Response>;
};

// Teto de segurança. Analytics sobre a loja inteira pode ficar caro se a
// loja tiver muitos milhares de pedidos — por ora paginamos até esse
// limite. Se precisar cobrir a loja inteira de verdade, isso deveria virar
// um job assíncrono (ex: rodar 1x por dia e cachear o resultado).
const MAX_ORDERS_SCANNED = 2000;

async function fetchOrdersForInsights(
  admin: GraphqlClient,
): Promise<ShopifyOrder[]> {
  const orders: ShopifyOrder[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage && orders.length < MAX_ORDERS_SCANNED) {
    const response = await admin.graphql(INSIGHTS_ORDERS_QUERY, {
      variables: { cursor },
    });

    const data = await response.json();
    const page = data.data.orders;

    orders.push(...(page.nodes as ShopifyOrder[]));

    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return orders.slice(0, MAX_ORDERS_SCANNED);
}

// ---------------------------------------------------------------------
// 1. Orders by Region
// ---------------------------------------------------------------------

export function getOrdersByRegion(orders: ShopifyOrder[]): RegionInsight[] {
  const counts = new Map<string, { label: string; count: number }>();
  let totalWithRegion = 0;

  for (const order of orders) {
    const addr = order.shippingAddress;
    if (!addr || !addr.provinceCode) continue;

    totalWithRegion++;

    const key = `${addr.countryCode ?? ""}-${addr.provinceCode}`;
    const label = regionLabel(addr.provinceCode, addr.countryCode);
    const current = counts.get(key) ?? { label, count: 0 };

    current.count += 1;
    counts.set(key, current);
  }

  return Array.from(counts.entries())
    .map(([code, { label, count }]) => ({
      code,
      label,
      orders: count,
      percentage:
        totalWithRegion > 0
          ? Math.round((count / totalWithRegion) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.orders - a.orders);
}

// ---------------------------------------------------------------------
// 2. Top Cities
// ---------------------------------------------------------------------

export function getTopCities(
  orders: ShopifyOrder[],
  limit = 10,
): CityInsight[] {
  const counts = new Map<string, number>();

  for (const order of orders) {
    const city = order.shippingAddress?.city?.trim();
    if (!city) continue;

    counts.set(city, (counts.get(city) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([city, count]) => ({ city, orders: count }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, limit);
}

// ---------------------------------------------------------------------
// 3. Product Preference by Region
// ---------------------------------------------------------------------

export function getProductsByRegion(
  orders: ShopifyOrder[],
  topPerRegion = 5,
): RegionProducts[] {
  const regionMap = new Map<string, Map<string, number>>();

  for (const order of orders) {
    const addr = order.shippingAddress;
    if (!addr || !addr.provinceCode) continue;

    const region = regionLabel(addr.provinceCode, addr.countryCode);
    const productMap = regionMap.get(region) ?? new Map<string, number>();

    for (const item of order.lineItems?.nodes ?? []) {
      if (!item.title) continue;
      productMap.set(item.title, (productMap.get(item.title) ?? 0) + item.quantity);
    }

    regionMap.set(region, productMap);
  }

  const result: RegionProducts[] = [];

  for (const [region, productMap] of regionMap.entries()) {
    const products = Array.from(productMap.entries())
      .map(([title, quantity]) => ({ title, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, topPerRegion);

    result.push({ region, products });
  }

  return result.sort((a, b) => {
    const totalA = a.products.reduce((sum, p) => sum + p.quantity, 0);
    const totalB = b.products.reduce((sum, p) => sum + p.quantity, 0);
    return totalB - totalA;
  });
}

// ---------------------------------------------------------------------
// Sumário pros cards do topo
// ---------------------------------------------------------------------

function getInsightsSummary(
  orders: ShopifyOrder[],
  regions: RegionInsight[],
): InsightsSummary {
  const productTotals = new Map<string, number>();

  for (const order of orders) {
    for (const item of order.lineItems?.nodes ?? []) {
      if (!item.title) continue;
      productTotals.set(
        item.title,
        (productTotals.get(item.title) ?? 0) + item.quantity,
      );
    }
  }

  let bestSellingProduct: { title: string; quantity: number } | null = null;

  for (const [title, quantity] of productTotals.entries()) {
    if (!bestSellingProduct || quantity > bestSellingProduct.quantity) {
      bestSellingProduct = { title, quantity };
    }
  }

  const topRegion =
    regions.length > 0
      ? { label: regions[0].label, percentage: regions[0].percentage }
      : null;

  return {
    totalOrders: orders.length,
    topRegion,
    bestSellingProduct,
  };
}

// ---------------------------------------------------------------------
// Entrypoint usado pela rota
// ---------------------------------------------------------------------

export async function buildInsights(admin: GraphqlClient): Promise<InsightsData> {
  const orders = await fetchOrdersForInsights(admin);

  const regions = getOrdersByRegion(orders);
  const topCities = getTopCities(orders);
  const productsByRegion = getProductsByRegion(orders);
  const summary = getInsightsSummary(orders, regions);

  return {
    totalScanned: orders.length,
    summary,
    regions,
    topCities,
    productsByRegion,
  };
}