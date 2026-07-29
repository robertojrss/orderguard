import { format as formatPostalCode } from "postal-code-checker";

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

export interface EligibleZipOrder {
  order: ShopifyOrder;
  originalZip: string;
  recommendedZip: string;
}

function isEmpty(value: string | null | undefined) {
  return value === null || value === undefined || value.trim() === "";
}

// A lib normaliza maiúsculas/espaços, mas não reinsere separadores.
// CEP brasileiro costuma perder o traço em importações/planilhas
// (ex: "01310100"). Reinserimos no formato oficial NNNNN-NNN.
// Fácil de estender pra outros países aqui no futuro (PT: NNNN-NNN, etc.)
function applyKnownSeparators(countryCode: string, formatted: string): string {
  if (countryCode === "BR") {
    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 8) {
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }
  }
  return formatted;
}

// Se o ZIP não for válido pro país, retorna null de propósito — igual ao
// módulo de phone, nunca "inventamos" um valor pra um dado que já está
// errado, só reformatamos o que já é válido mas está mal formatado.
function buildRecommendedZip(zip: string, countryCode: string): string | null {
  const canonical = formatPostalCode(countryCode, zip);
  if (!canonical) return null;
  return applyKnownSeparators(countryCode, canonical);
}

function parseOrderZip(order: ShopifyOrder): string | null {
  const addr = order.shippingAddress;
  if (!addr) return null;
  if (isEmpty(addr.zip)) return null;
  if (isEmpty(addr.countryCode)) return null;
  return buildRecommendedZip(addr.zip!, addr.countryCode!);
}

export function buildEligibleZipList(orders: ShopifyOrder[]): EligibleZipOrder[] {
  const eligible: EligibleZipOrder[] = [];

  for (const order of orders) {
    const recommended = parseOrderZip(order);
    if (!recommended) continue;

    const original = order.shippingAddress!.zip!;
    if (recommended === original) continue;

    eligible.push({ order, originalZip: original, recommendedZip: recommended });
  }

  return eligible;
}

export const ORDERS_BY_ID_QUERY = `#graphql
  query getOrdersByIdsForZipRepair($ids: [ID!]!) {
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
          nodes { key value }
        }
      }
    }
  }
`;

export const ORDER_UPDATE_MUTATION = `#graphql
  mutation repairOrderZip($input: OrderInput!) {
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

function buildOrderUpdateInput(order: ShopifyOrder, zip: string) {
  const addr = order.shippingAddress!;
  return {
    id: order.id,
    shippingAddress: {
      firstName: addr.firstName,
      lastName: addr.lastName,
      company: addr.company,
      address1: addr.address1,
      address2: addr.address2,
      city: addr.city,
      provinceCode: addr.provinceCode,
      countryCode: addr.countryCode,
      zip,
      phone: addr.phone,
    },
  };
}

function parseOrderNodes(nodes: unknown[]): ShopifyOrder[] {
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

// Mesma política de erro do CPF e do Phone: para IMEDIATAMENTE no
// primeiro erro, em vez de acumular falhas e seguir em frente.
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
  const eligible = buildEligibleZipList(orders);

  const succeeded: RepairSuccess[] = [];

  for (const item of eligible) {
    const input = buildOrderUpdateInput(item.order, item.recommendedZip);

    const mutationResponse = await admin.graphql(ORDER_UPDATE_MUTATION, {
      variables: { input },
    });
    const result = await mutationResponse.json();

    if (result.errors) {
      return {
        succeeded,
        stoppedAt: {
          id: item.order.id,
          name: item.order.name,
          error: result.errors
            .map((e: { message: string }) => e.message)
            .join("; "),
        },
      };
    }

    const userErrors = result.data?.orderUpdate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return {
        succeeded,
        stoppedAt: {
          id: item.order.id,
          name: item.order.name,
          error: userErrors
            .map((e: { message: string }) => e.message)
            .join("; "),
        },
      };
    }

    succeeded.push({ id: item.order.id, name: item.order.name });
  }

  return { succeeded, stoppedAt: null };
}