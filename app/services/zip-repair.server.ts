import { format as formatPostalCode } from "postal-code-checker";

import type {
  ShopifyOrder,
} from "./orders.server";

import type {
  GraphqlClient,
  RepairResult,
  RepairSuccess,
} from "./repair-engine.server";



export interface EligibleZipOrder {

  order: ShopifyOrder;

  originalZip:string;

  recommendedZip:string;

}



function isEmpty(
  value:string|null|undefined
){

 return (
  value === null ||
  value === undefined ||
  value.trim()===""
 );

}




function applyKnownSeparators(
 countryCode:string,
 formatted:string
){

 if(countryCode==="BR"){

  const digits =
    formatted.replace(/\D/g,"");


  if(digits.length===8){

   return (
    `${digits.slice(0,5)}-${digits.slice(5)}`
   );

  }

 }


 return formatted;

}





function buildRecommendedZip(
 zip:string,
 countryCode:string
):string|null{


 const canonical =
  formatPostalCode(
    countryCode,
    zip
  );


 if(!canonical)
   return null;


 return applyKnownSeparators(
   countryCode,
   canonical
 );

}





function parseOrderZip(
 order:ShopifyOrder
):string|null{


 const address =
  order.shippingAddress;


 if(!address)
   return null;


 if(
  isEmpty(address.zip)
 )
   return null;



 if(
  isEmpty(address.countryCode)
 )
   return null;



 return buildRecommendedZip(
  address.zip!,
  address.countryCode!
 );

}






export function buildEligibleZipList(
 orders:ShopifyOrder[]
):EligibleZipOrder[]{


 const eligible:
  EligibleZipOrder[]=[];



 for(const order of orders){


  const recommended =
    parseOrderZip(order);



  if(!recommended)
    continue;



  const original =
    order.shippingAddress!.zip!;



  if(
    recommended===original
  )
    continue;



  eligible.push({

    order,

    originalZip:
      original,


    recommendedZip:
      recommended,

  });


 }



 return eligible;

}







export const ORDERS_BY_ID_QUERY = `#graphql

query getOrdersByIdsForZipRepair($ids:[ID!]!) {

 nodes(ids:$ids){

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

mutation repairOrderZip($input:OrderInput!){

 orderUpdate(input:$input){

  order{

   id
   name

   shippingAddress{

    zip

   }

  }


  userErrors{

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
  (node):node is ShopifyOrder =>
    node!==null
 );


}







function buildOrderUpdateInput(
 order:ShopifyOrder,
 zip:string
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


   zip,


   phone:
    addr.phone,

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
     ids:orderIds
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
  buildEligibleZipList(
   orders
  );





 const succeeded:
  RepairSuccess[]=[];






 for(const item of eligible){



  const input =
   buildOrderUpdateInput(
    item.order,
    item.recommendedZip
   );






  const mutationResponse =
   await admin.graphql(

    ORDER_UPDATE_MUTATION,

    {

     variables:{
      input
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
      .join("; ")


    }


   };

  }






  const userErrors =
   result.data?.orderUpdate?.userErrors ?? [];





  if(userErrors.length>0){


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
      .join("; ")


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