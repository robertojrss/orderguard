import type {
  ShopifyOrder,
} from "./orders.server";

import type {
  GraphqlClient,
  RepairResult,
  RepairSuccess,
} from "./repair-engine.server";



export interface EligibleOrder {
  order: ShopifyOrder;
  taxIdentifier: string;
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



function isEmpty(
  value: string | null | undefined
) {

  return (
    value === null ||
    value === undefined ||
    value.trim() === ""
  );

}

export const SUPPORTED_LOCALIZED_KEYS = [

  // Brazil
  "SHIPPING_CREDENTIAL_BR",
  "TAX_CREDENTIAL_BR",

  // Chile
  "SHIPPING_CREDENTIAL_CL",
  "TAX_CREDENTIAL_CL",

  // Colombia
  "SHIPPING_CREDENTIAL_CO",
  "TAX_CREDENTIAL_CO",

  // Costa Rica
  "SHIPPING_CREDENTIAL_CR",
  "TAX_CREDENTIAL_CR",

  // Ecuador
  "SHIPPING_CREDENTIAL_EC",
  "TAX_CREDENTIAL_EC",

  // Guatemala
  "SHIPPING_CREDENTIAL_GT",
  "TAX_CREDENTIAL_GT",

  // Mexico
  "SHIPPING_CREDENTIAL_MX",
  "TAX_CREDENTIAL_MX",

  // Paraguay
  "SHIPPING_CREDENTIAL_PY",
  "TAX_CREDENTIAL_PY",

  // Peru
  "SHIPPING_CREDENTIAL_PE",
  "TAX_CREDENTIAL_PE",

  // Indonesia
  "SHIPPING_CREDENTIAL_ID",
  "TAX_CREDENTIAL_ID",

  // Malaysia
  "TAX_CREDENTIAL_MY",

  // Turkey
  "SHIPPING_CREDENTIAL_TR",
  "TAX_CREDENTIAL_TR",

  // Spain
  "SHIPPING_CREDENTIAL_ES",
  "TAX_CREDENTIAL_ES",

  // Portugal
  "TAX_CREDENTIAL_PT",

// Italy
"TAX_CREDENTIAL_IT",

// China
"SHIPPING_CREDENTIAL_CN",

// South Korea
"SHIPPING_CREDENTIAL_KR",

// Malaysia
"SHIPPING_CREDENTIAL_MY",
"TAX_CREDENTIAL_MY",

// Taiwan
"SHIPPING_CREDENTIAL_TW",

];

export function findTaxCredential(
  order: ShopifyOrder
): string | null {

  const fields =
    order.localizedFields?.nodes ?? [];

  const field = fields.find(
    (item) =>
      SUPPORTED_LOCALIZED_KEYS.includes(item.key)
  );

  return field
    ? field.value
    : null;

}



export function buildEligibleList(
  orders: ShopifyOrder[]
): EligibleOrder[] {

  const eligible: EligibleOrder[] = [];

  for (const order of orders) {

    const address =
      order.shippingAddress;

    if (!address)
      continue;

    if (!isEmpty(address.company))
      continue;

    const taxIdentifier =
      findTaxCredential(order);

    if (!taxIdentifier)
      continue;

    eligible.push({
      order,
      taxIdentifier,
    });

  }

  return eligible;

}


export function buildOrderUpdateInput(
  order: ShopifyOrder,
  taxIdentifier: string
) {


  const addr =
    order.shippingAddress!;


  return {

    id: order.id,


    shippingAddress: {

      firstName:
        addr.firstName,

      lastName:
        addr.lastName,

      company:
        taxIdentifier,

      address1:
        addr.address1,

      address2:
        addr.address2,

      city:
        addr.city,

      provinceCode:
        addr.provinceCode,

      countryCode:
        addr.countryCode,

      zip:
        addr.zip,

      phone:
        addr.phone,

    },

  };

}



export const ORDERS_BY_ID_QUERY = `#graphql
  query getOrdersByIdsFortaxIdentifierRepair($ids: [ID!]!) {

    nodes(ids: $ids) {

      ... on Order {

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


        localizedFields(first:20) {

          nodes {
            key
            value
          }

        }

      }

    }

  }
`;


function parseOrderNodes(
  nodes: unknown[]
): ShopifyOrder[] {


  return (
    nodes as (ShopifyOrder | null)[]
  )
  .filter(
    (order): order is ShopifyOrder =>
      order !== null
  );

}





export async function repairOrdersByIds(
  admin: GraphqlClient,
  orderIds:string[]
):Promise<RepairResult>{


  if(orderIds.length === 0){

    return {
      succeeded:[],
      stoppedAt:null,
    };

  }



  const response =
    await admin.graphql(
      ORDERS_BY_ID_QUERY,
      {
        variables:{
          ids:orderIds,
        },
      }
    );



  const data =
    await response.json();



  const orders =
    parseOrderNodes(
      data.data.nodes
    );



  const eligible =
    buildEligibleList(
      orders
    );



  const succeeded:RepairSuccess[]=[];



  for(const item of eligible){


    const input =
      buildOrderUpdateInput(
        item.order,
        item.taxIdentifier
      );



    const mutationResponse =
      await admin.graphql(
        ORDER_UPDATE_MUTATION,
        {
          variables:{
            input,
          },
        }
      );



    const result =
      await mutationResponse.json();



    if(result.errors){

      return {

        succeeded,

        stoppedAt:{

          id:item.order.id,

          name:item.order.name,

          error:
            result.errors
            .map(
              (e:{message:string}) =>
                e.message
            )
            .join("; "),

        },

      };

    }



    const userErrors =
      result.data?.orderUpdate?.userErrors ?? [];



    if(userErrors.length > 0){


      return {

        succeeded,

        stoppedAt:{

          id:item.order.id,

          name:item.order.name,

          error:
            userErrors
            .map(
              (e:{message:string}) =>
                e.message
            )
            .join("; "),

        },

      };

    }



    succeeded.push({

      id:item.order.id,

      name:item.order.name,

    });


  }



  return {

    succeeded,

    stoppedAt:null,

  };

}