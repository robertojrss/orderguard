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

export interface ShopifyOrder {
  id: string;
  name: string;
  shippingAddress: ShippingAddress | null;
}


export interface AddressCorrection {
  order: ShopifyOrder;
  originalAddress1: string;
  recommendedAddress1: string;
  recommendedAddress2: string | null;
  warning?: string;
}


function cleanSpaces(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim();
}


function cleanAddressCharacters(value: string) {
  return value
    .replace(/[!@#$%^&*_=+]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => {

      if (
        word.includes("-") ||
        /\d/.test(word)
      ) {
        return word.toUpperCase();
      }

      return word.charAt(0).toUpperCase() + word.slice(1);

    })
    .join(" ");
}


/*
BR:

Rua das Flores 123 Apto 4

vira:

Rua Das Flores 123
Apto 4
*/
function normalizeBrazilAddress(
  address1: string,
  address2: string | null
) {

  let working =
    cleanAddressCharacters(address1);


  let extractedComplement = "";


  const complementRegex =
    /\b(apto|apartamento|ap|bloco|casa|fundos|sala|andar|torre|quadra|lote)\s*[\w-]*/i;


  const match =
    working.match(complementRegex);


  if (match) {

    extractedComplement =
      match[0];

    working =
      working
        .replace(match[0], "")
        .trim();

  }


  return {

    address1:
      titleCase(working),

    address2:
      [
        address2,
        extractedComplement
      ]
      .filter(Boolean)
      .join(", ") || null

  };

}



/*
US:

123 Main Street Apt 4

vira:

123 Main Street
Apt 4
*/
function normalizeUSAddress(
  address1: string,
  address2: string | null
) {

  let working =
    cleanAddressCharacters(address1);


  let extracted = "";


  const regex =
    /\b(apt|apartment|suite|unit|floor|fl)\s*#?\w+/i;


  const match =
    working.match(regex);


  if (match) {

    extracted =
      match[0];

    working =
      working
        .replace(match[0], "")
        .trim();

  }


  return {

    address1:
      titleCase(working),

    address2:
      [
        address2,
        extracted
      ]
      .filter(Boolean)
      .join(", ") || null

  };

}



export function formatAddress(
  address: ShippingAddress,
  enableCountryRules: boolean
) {

  if (!address.address1)
    return null;


  let result = {

    address1:
      titleCase(
        cleanAddressCharacters(address.address1)
      ),

    address2:
      address.address2
        ? cleanAddressCharacters(address.address2)
        : null

  };



  if (enableCountryRules) {


    if (address.countryCode === "BR") {

      result =
        normalizeBrazilAddress(
          address.address1,
          address.address2
        );

    }


    if (address.countryCode === "US") {

      result =
        normalizeUSAddress(
          address.address1,
          address.address2
        );

    }

  }


  return result;

}



export function buildEligibleAddressList(
  orders: ShopifyOrder[],
  enableCountryRules: boolean
) {

  const eligible: AddressCorrection[] = [];


  for (const order of orders) {


    if (!order.shippingAddress?.address1)
      continue;



    const formatted =
      formatAddress(
        order.shippingAddress,
        enableCountryRules
      );



    if (!formatted)
      continue;



    if (
      formatted.address1 !== order.shippingAddress.address1 ||
      formatted.address2 !== order.shippingAddress.address2
    ) {


      const hasNumber =
        /\d/.test(formatted.address1);



      eligible.push({

        order,

        originalAddress1:
          order.shippingAddress.address1,

        recommendedAddress1:
          formatted.address1,

        recommendedAddress2:
          formatted.address2,

        warning:
          hasNumber
            ? undefined
            : "Address may be missing a number"

      });

    }

  }


  return eligible;

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



export const ORDERS_BY_ID_QUERY = `#graphql
query getOrdersByIdsForAddressRepair($ids: [ID!]!) {
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
    }
  }
}
`;



export const ORDER_UPDATE_MUTATION = `#graphql
mutation repairOrderAddress($input: OrderInput!) {
  orderUpdate(input: $input) {
    order {
      id
      name
    }
    userErrors {
      field
      message
    }
  }
}
`;



function parseOrderNodes(nodes: unknown[]): ShopifyOrder[] {

  return (nodes as (ShopifyOrder | null)[])
    .filter(
      (node): node is ShopifyOrder =>
        node !== null
    );

}



function buildOrderUpdateInput(
  order: ShopifyOrder,
  address1: string,
  address2: string | null
) {

  const addr =
    order.shippingAddress!;


  return {

    id: order.id,

    shippingAddress: {

      firstName: addr.firstName,
      lastName: addr.lastName,
      company: addr.company,

      address1,

      address2,

      city: addr.city,
      provinceCode: addr.provinceCode,
      countryCode: addr.countryCode,
      zip: addr.zip,
      phone: addr.phone

    }

  };

}



type GraphqlClient = {

  graphql: (
    query: string,
    options?: {
      variables?: Record<string, any>
    }
  ) => Promise<Response>;

};



export async function repairOrdersByIds(
  admin: GraphqlClient,
  orderIds: string[],
  enableCountryRules: boolean
): Promise<RepairResult> {


  if (orderIds.length === 0) {

    return {
      succeeded: [],
      stoppedAt: null
    };

  }



  const response =
    await admin.graphql(
      ORDERS_BY_ID_QUERY,
      {
        variables: {
          ids: orderIds
        }
      }
    );



  const data =
    await response.json();



  const orders =
    parseOrderNodes(
      data.data.nodes
    );



  const eligible =
    buildEligibleAddressList(
      orders,
      enableCountryRules
    );



  const succeeded: RepairSuccess[] = [];



  for (const item of eligible) {


    const input =
      buildOrderUpdateInput(
        item.order,
        item.recommendedAddress1,
        item.recommendedAddress2
      );



    const mutationResponse =
      await admin.graphql(
        ORDER_UPDATE_MUTATION,
        {
          variables: {
            input
          }
        }
      );



    const result =
      await mutationResponse.json();



    const userErrors =
      result.data?.orderUpdate?.userErrors ?? [];



    if (userErrors.length > 0) {

      return {

        succeeded,

        stoppedAt: {

          id: item.order.id,

          name: item.order.name,

          error:
            userErrors
              .map(
                (e: {message:string}) =>
                  e.message
              )
              .join("; ")

        }

      };

    }



    succeeded.push({

      id: item.order.id,

      name: item.order.name

    });

  }



  return {

    succeeded,

    stoppedAt: null

  };

}