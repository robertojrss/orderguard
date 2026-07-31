import {
  parsePhoneNumber,
  isValidPhoneNumber,
} from "libphonenumber-js";

import type {
  ShopifyOrder,
} from "./orders.server";

import type {
  GraphqlClient,
  RepairResult,
  RepairSuccess,
} from "./repair-engine.server";



export interface EligiblePhoneOrder {
  order: ShopifyOrder;
  originalPhone: string;
  recommendedPhone: string;
}



function isEmpty(
  value:string|null|undefined
){

  return (
    value === null ||
    value === undefined ||
    value.trim() === ""
  );

}




function normalizePhone(
  phone:string,
  countryCode:string|null
):string|null{


  try {


    if(!countryCode)
      return null;



    const parsed =
      parsePhoneNumber(
        phone,
        countryCode as any
      );



    if(
      !parsed ||
      !isValidPhoneNumber(
        phone,
        countryCode as any
      )
    ){

      return null;

    }



    return parsed.formatInternational();



  } catch {

    return null;

  }

}




function parseOrderPhone(
  order:ShopifyOrder
):string|null{


  const phone =
    order.shippingAddress?.phone;



  if(
    isEmpty(phone)
  )
    return null;



const country =
  order.shippingAddress?.countryCode;


return normalizePhone(
  phone!,
  country ?? null
);

}




export function buildEligiblePhoneList(
  orders:ShopifyOrder[]
):EligiblePhoneOrder[]{


  const eligible:EligiblePhoneOrder[]=[];



  for(const order of orders){


    const recommended =
      parseOrderPhone(order);



    if(!recommended)
      continue;



    const original =
      order.shippingAddress!.phone!;



    if(
      recommended === original
    )
      continue;



    eligible.push({

      order,

      originalPhone:
        original,

      recommendedPhone:
        recommended,

    });


  }



  return eligible;

}





export const ORDERS_BY_ID_QUERY = `#graphql

query getOrdersByIdsForPhoneRepair($ids:[ID!]!) {

 nodes(ids:$ids) {

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

  }

 }

}

`;





export const ORDER_UPDATE_MUTATION = `#graphql

mutation repairOrderPhone($input:OrderInput!) {

 orderUpdate(input:$input) {

  order {

    id
    name

    shippingAddress {

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





function parseOrderNodes(
  nodes:unknown[]
):ShopifyOrder[]{


 return (
   nodes as (ShopifyOrder|null)[]
 )
 .filter(
   (order):order is ShopifyOrder =>
     order !== null
 );

}




function buildOrderUpdateInput(
  order:ShopifyOrder,
  phone:string
){

 const addr =
   order.shippingAddress!;


 return {


  id:
    order.id,


  shippingAddress:{


    firstName:
      addr.firstName,


    lastName:
      addr.lastName,


    company:
      addr.company,


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


    phone,


  }


 };

}













export async function repairOrdersByIds(

 admin:GraphqlClient,

 orderIds:string[]

):Promise<RepairResult>{



 if(orderIds.length===0){

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
   buildEligiblePhoneList(
    orders
   );



 const succeeded:
   RepairSuccess[]=[];



 for(const item of eligible){



  const input =
    buildOrderUpdateInput(
      item.order,
      item.recommendedPhone
    );




  const mutationResponse =
    await admin.graphql(

      ORDER_UPDATE_MUTATION,

      {

       variables:{
        input,
       }

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


    }


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


    }


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