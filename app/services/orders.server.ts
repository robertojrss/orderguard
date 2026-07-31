import type { GraphqlClient } from "./repair-engine.server";

export interface ShippingAddress {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string | null;
  address2: string |null;
  city: string | null;
  provinceCode: string | null;
  countryCode: string | null;
  zip: string | null;
  phone: string | null;
}

export interface LocalizedField {
  key: string;
  value: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  email: string | null;

  shippingAddress: ShippingAddress | null;

  localizedFields: {
    nodes: LocalizedField[];
  };
}

export interface OrderFetchOptions {
  limit?: number;
  lastDays?: number;
}

export const ORDERS_QUERY = `#graphql
query getOrders(
  $first: Int!
  $after: String
  $query: String
) {
  orders(
    first: $first
    after: $after
    reverse: true
    query: $query
  ) {
    nodes {
      id
      name
      email

      shippingAddress {
        firstName
        lastName
        company
        address1
        address2
        city
        provinceCode
        countryCode
        zip
        phone
      }

      localizedFields(first: 20) {
        nodes {
          key
          value
        }
      }
    }

    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

const DEFAULT_PAGE_SIZE = 250;

function buildSearchQuery(
  options: OrderFetchOptions,
): string | undefined {

  const filters: string[] = [];

  if (options.lastDays) {
    const date = new Date();

    date.setDate(
      date.getDate() - options.lastDays,
    );

    filters.push(
      `created_at:>=${date.toISOString().split("T")[0]}`,
    );
  }

  return filters.length > 0
    ? filters.join(" ")
    : undefined;
}

export async function getOrders(
  admin: GraphqlClient,
  options: OrderFetchOptions = {},
): Promise<ShopifyOrder[]> {

  const {
    limit = 250,
  } = options;

  return getOrdersPaginated(
    admin,
    {
      ...options,
      limit,
    },
  );
}

export async function getOrdersPaginated(
  admin: GraphqlClient,
  options: OrderFetchOptions = {},
): Promise<ShopifyOrder[]> {

  const {
    limit = 10000,
  } = options;

  const orders: ShopifyOrder[] = [];

  let cursor: string | null = null;
  let hasNextPage = true;

  const query = buildSearchQuery(options);

  while (
    hasNextPage &&
    orders.length < limit
  ) {

    const remaining =
      limit - orders.length;

    const first = Math.min(
      DEFAULT_PAGE_SIZE,
      remaining,
    );

    const variables: Record<string, unknown> = {
      first,
      after: cursor,
    };

    if (query) {
      variables.query = query;
    }

    const response =
      await admin.graphql(
        ORDERS_QUERY,
        {
          variables,
        },
      );

    const json =
      await response.json();

    const result =
      json.data.orders;

    orders.push(
      ...result.nodes,
    );

    hasNextPage =
      result.pageInfo.hasNextPage;

    cursor =
      result.pageInfo.endCursor;
  }

  return orders;
}