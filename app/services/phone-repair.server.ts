import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

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
  localizedFields: {
    nodes: LocalizedField[];
  };
}

export interface PhoneFormats {
  international: string;
  national: string;
  e164: string;
  rfc3966: string;
}

export interface EligiblePhoneOrder {
  order: ShopifyOrder;
  originalPhone: string;
  recommendedPhone: string;
  formats: PhoneFormats;
}

export type PhoneOutputFormat =
  | "international"
  | "national"
  | "e164"
  | "rfc3966";

function isEmpty(value: string | null | undefined) {
  return value === null || value === undefined || value.trim() === "";
}

function normalizePhone(text: string) {
  return text.replace(/[^\d+]/g, "");
}

function buildFormats(
  phone: ReturnType<typeof parsePhoneNumberFromString>,
): PhoneFormats {
  return {
    international: phone!.formatInternational(),
    national: phone!.formatNational(),
    e164: phone!.number,
    rfc3966: phone!.format("RFC3966"),
  };
}

function parseOrderPhone(order: ShopifyOrder) {
  const addr = order.shippingAddress;

  if (!addr) return null;
  if (isEmpty(addr.phone)) return null;
  if (isEmpty(addr.countryCode)) return null;

  try {
    const parsed = parsePhoneNumberFromString(
      addr.phone!,
      addr.countryCode as CountryCode,
    );

    if (!parsed) return null;
    if (!parsed.isValid()) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function buildEligiblePhoneList(
  orders: ShopifyOrder[],
  output: PhoneOutputFormat = "international",
): EligiblePhoneOrder[] {
  const eligible: EligiblePhoneOrder[] = [];

  for (const order of orders) {
    const parsed = parseOrderPhone(order);
    if (!parsed) continue;

    const formats = buildFormats(parsed);

    const current = normalizePhone(order.shippingAddress!.phone!);
    const desired = normalizePhone(formats[output]);

    if (current === desired) continue;

    eligible.push({
      order,
      originalPhone: order.shippingAddress!.phone!,
      recommendedPhone: formats.international,
      formats,
    });
  }

  return eligible;
}

// Sem "namespace" — esse argumento não existe em localizedFields.
// A query original que já validamos contra a API real usa só (first: N).
export const ORDERS_BY_ID_QUERY = `#graphql
  query getOrdersByIdsForPhoneRepair($ids: [ID!]!) {
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
  mutation repairOrderPhone($input: OrderInput!) {
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

function buildOrderUpdateInput(order: ShopifyOrder, phone: string) {
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
      zip: addr.zip,
      phone,
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

// Mesma política de erro do módulo de CPF: para IMEDIATAMENTE no primeiro
// erro, em vez de acumular falhas e seguir em frente.
export async function repairOrdersByIds(
  admin: GraphqlClient,
  orderIds: string[],
  output: PhoneOutputFormat = "international",
): Promise<RepairResult> {
  if (orderIds.length === 0) {
    return { succeeded: [], stoppedAt: null };
  }

  const response = await admin.graphql(ORDERS_BY_ID_QUERY, {
    variables: { ids: orderIds },
  });
  const data = await response.json();
  const orders = parseOrderNodes(data.data.nodes);

  // Reconfere a elegibilidade com dado fresco, igual ao módulo de CPF —
  // nunca confia cegamente no que veio do navegador.
  const eligible = buildEligiblePhoneList(orders, output);

  const succeeded: RepairSuccess[] = [];

  for (const item of eligible) {
    const input = buildOrderUpdateInput(item.order, item.formats[output]);

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