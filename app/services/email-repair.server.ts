import isEmail from "validator/lib/isEmail";
import { parse } from "tldts";

export interface ShopifyOrder {
  id: string;
  name: string;
  email: string | null;
}

export type EmailStatus = "invalid" | "corrected" | "disposable" | "valid";

export interface EligibleEmailOrder {
  order: ShopifyOrder;
  originalEmail: string;
  recommendedEmail: string | null;
  status: EmailStatus;
  warning?: string;
}

const disposableDomains = [
  "10minutemail.com",
  "tempmail.com",
  "guerrillamail.com",
  "mailinator.com",
  "trashmail.com",
  "yopmail.com",
];

const commonMistakes: Record<string, string> = {
  "gmailcom": "gmail.com",
  "gmal.com": "gmail.com",
  "gmial.com": "gmail.com",
  "hotnail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "yaho.com": "yahoo.com",
};

function isEmpty(value: string | null | undefined) {
  return value === null || value === undefined || value.trim() === "";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function detectTypo(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) return null;

  const domain = parts[1];
  if (commonMistakes[domain]) {
    return `${parts[0]}@${commonMistakes[domain]}`;
  }

  return null;
}

function isDisposable(email: string): boolean {
  const domain = email.split("@")[1];
  return disposableDomains.includes(domain);
}

function hasValidDomain(email: string): boolean {
  const parsed = parse(email);
  return Boolean(parsed.domain);
}

function evaluateEmail(email: string): {
  recommendedEmail: string | null;
  status: EmailStatus;
  warning?: string;
} {
  const normalized = normalizeEmail(email);

  const typo = detectTypo(normalized);
  if (typo) {
    return {
      recommendedEmail: typo,
      status: "corrected",
      warning: "Possível erro de digitação no domínio",
    };
  }

  if (!isEmail(normalized)) {
    return {
      recommendedEmail: null,
      status: "invalid",
      warning: "Formato de email inválido",
    };
  }

  if (!hasValidDomain(normalized)) {
    return {
      recommendedEmail: null,
      status: "invalid",
      warning: "Domínio de email inválido",
    };
  }

  if (isDisposable(normalized)) {
    return {
      recommendedEmail: null,
      status: "disposable",
      warning: "Provedor de email temporário",
    };
  }

  return {
    recommendedEmail: normalized,
    status: "valid",
  };
}

export function buildEligibleEmailList(
  orders: ShopifyOrder[],
): EligibleEmailOrder[] {
  const eligible: EligibleEmailOrder[] = [];

  for (const order of orders) {
    if (isEmpty(order.email)) continue;

    const result = evaluateEmail(order.email!);

    // "valid" só entra na lista se a normalização mudar algo
    // (ex: maiúsculas/espaços). Se já está exatamente igual, ignora.
    if (result.status === "valid" && result.recommendedEmail === order.email) {
      continue;
    }

    eligible.push({
      order,
      originalEmail: order.email!,
      recommendedEmail: result.recommendedEmail,
      status: result.status,
      warning: result.warning,
    });
  }

  return eligible;
}

// Diferente de phone/zip/cpf: email é campo direto do Order, não fica
// dentro de shippingAddress nem localizedFields.
export const ORDERS_BY_ID_QUERY = `#graphql
  query getOrdersByIdsForEmailRepair($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order {
        id
        name
        email
      }
    }
  }
`;

export const ORDER_UPDATE_MUTATION = `#graphql
  mutation repairOrderEmail($input: OrderInput!) {
    orderUpdate(input: $input) {
      order {
        id
        name
        email
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function buildOrderUpdateInput(order: ShopifyOrder, email: string) {
  return {
    id: order.id,
    email,
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

// Mesma política de erro dos outros módulos: para IMEDIATAMENTE no
// primeiro erro. E só aplica o reparo em itens com status "corrected" —
// "invalid"/"disposable" não têm email correto pra escrever, então mesmo
// que o id venha selecionado (o que não deveria acontecer, já que a UI
// não mostra checkbox pra eles), são ignorados silenciosamente aqui.
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
  const eligible = buildEligibleEmailList(orders).filter(
    (item) => item.status === "corrected" && item.recommendedEmail,
  );

  const succeeded: RepairSuccess[] = [];

  for (const item of eligible) {
    const input = buildOrderUpdateInput(item.order, item.recommendedEmail!);

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