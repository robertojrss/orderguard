export interface ShippingAddress {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  provinceCode: string | null;
  countryCode: string | null;
  zip: string | null;
  phone: string | null;
}

interface LocalizedField {
  key: string;
  value: string;
}

export interface ShopifyOrder {
  id: string;
  name: string;
  shippingAddress: ShippingAddress | null;
  localizedFields: { nodes: LocalizedField[] };
}

export interface EligibleOrder {
  order: ShopifyOrder;
  cpf: string;
}

export const ORDER_UPDATE_MUTATION = `#graphql
  mutation repairOrderCompany($input: OrderInput!) {
    orderUpdate(input: $input) {
      order {
        id
        name
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
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function isEmpty(value: string | null | undefined) {
  return value === null || value === undefined || value === "";
}

export function findTaxCredential(order: ShopifyOrder): string | null {
  const nodes = order.localizedFields?.nodes ?? [];
  const field = nodes.find((n) => n.key === "TAX_CREDENTIAL_BR");
  return field ? field.value : null;
}

export function buildEligibleList(orders: ShopifyOrder[]): EligibleOrder[] {
  const eligible: EligibleOrder[] = [];
  for (const order of orders) {
    const addr = order.shippingAddress;
    if (!addr) continue;
    if (!isEmpty(addr.company)) continue;
    const cpf = findTaxCredential(order);
    if (!cpf) continue;
    eligible.push({ order, cpf });
  }
  return eligible;
}

export function buildOrderUpdateInput(order: ShopifyOrder, cpf: string) {
  const addr = order.shippingAddress!;
  return {
    id: order.id,
    shippingAddress: {
      firstName: addr.firstName,
      lastName: addr.lastName,
      company: cpf,
      address1: addr.address1,
      address2: addr.address2,
      city: addr.city,
      provinceCode: addr.provinceCode,
      countryCode: addr.countryCode,
      zip: addr.zip,
      phone: addr.phone,
    },
  };
}

export const ORDERS_BY_ID_QUERY = `#graphql
  query getOrdersByIdsForRepair($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order {
        id
        name
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
    }
  }
`;

export function parseOrderNodes(nodes: unknown[]): ShopifyOrder[] {
  return (nodes as (ShopifyOrder | null)[]).filter(
    (n): n is ShopifyOrder => n !== null,
  );
}

export interface RepairSuccess {
  id: string;
  name: string;
}

export interface RepairStoppedAt {
  id: string;
  name: string;
  error: string;
}

export interface RepairResult {
  succeeded: RepairSuccess[];
  stoppedAt: RepairStoppedAt | null;
}

type GraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, any> },
  ) => Promise<Response>;
};

export async function repairOrders(
  admin: GraphqlClient,
  eligible: EligibleOrder[],
): Promise<RepairResult> {
  const succeeded: RepairSuccess[] = [];

  for (const { order, cpf } of eligible) {
    const input = buildOrderUpdateInput(order, cpf);

    const response = await admin.graphql(ORDER_UPDATE_MUTATION, {
      variables: { input },
    });
    const data = await response.json();

    if (data.errors) {
      return {
        succeeded,
        stoppedAt: {
          id: order.id,
          name: order.name,
          error: data.errors.map((e: { message: string }) => e.message).join("; "),
        },
      };
    }

    const userErrors = data.data?.orderUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return {
        succeeded,
        stoppedAt: {
          id: order.id,
          name: order.name,
          error: userErrors.map((e: { message: string }) => e.message).join("; "),
        },
      };
    }

    succeeded.push({ id: order.id, name: order.name });
  }

  return { succeeded, stoppedAt: null };
}

export async function repairOrdersByIds(
  admin: GraphqlClient,
  orderIds: string[],
): Promise<RepairResult> {
  if (orderIds.length === 0) {
    return { succeeded: [], stoppedAt: null };
  }

  const response = await admin.graphql(ORDERS_BY_ID_QUERY, {
    variables: { ids: orderIds },
  });
  const data = await response.json();
  const orders = parseOrderNodes(data.data.nodes);

  // Reconfere a elegibilidade com dado fresco — nunca confia cegamente
  // na seleção que veio do navegador.
  const eligible = buildEligibleList(orders);

  return repairOrders(admin, eligible);
}