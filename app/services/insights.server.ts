import type {
  GraphqlClient,
} from "./repair-engine.server";


export interface InsightsOptions {
  limit?: number;
  lastDays?: number;
}


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
  lineItems: {
    nodes: LineItem[];
  };
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
  topRegion: {
    label: string;
    percentage: number;
  } | null;

  bestSellingProduct: {
    title: string;
    quantity: number;
  } | null;
}


export interface InsightsData {
  totalScanned: number;
  summary: InsightsSummary;
  regions: RegionInsight[];
  topCities: CityInsight[];
  productsByRegion: RegionProducts[];
}



// -----------------------------------------------------
// Brazil states
// -----------------------------------------------------

const BR_PROVINCE_NAMES: Record<string,string> = {

  AC:"Acre",
  AL:"Alagoas",
  AP:"Amapá",
  AM:"Amazonas",
  BA:"Bahia",
  CE:"Ceará",
  DF:"Distrito Federal",
  ES:"Espírito Santo",
  GO:"Goiás",
  MA:"Maranhão",
  MT:"Mato Grosso",
  MS:"Mato Grosso do Sul",
  MG:"Minas Gerais",
  PA:"Pará",
  PB:"Paraíba",
  PR:"Paraná",
  PE:"Pernambuco",
  PI:"Piauí",
  RJ:"Rio de Janeiro",
  RN:"Rio Grande do Norte",
  RS:"Rio Grande do Sul",
  RO:"Rondônia",
  RR:"Roraima",
  SC:"Santa Catarina",
  SP:"São Paulo",
  SE:"Sergipe",
  TO:"Tocantins",

};



function regionLabel(
  provinceCode:string|null,
  countryCode:string|null,
):string {

  if(!provinceCode)
    return "Unknown";


  if(
    countryCode==="BR" &&
    BR_PROVINCE_NAMES[provinceCode]
  ){
    return BR_PROVINCE_NAMES[provinceCode];
  }


  return provinceCode;

}



// -----------------------------------------------------
// Query
// -----------------------------------------------------

export const INSIGHTS_ORDERS_QUERY = `#graphql

query getOrdersForInsights(
  $cursor:String
  $query:String
){

  orders(
    first:250
    after:$cursor
    reverse:true
    query:$query
  ){

    pageInfo{
      hasNextPage
      endCursor
    }


    nodes{

      id
      name


      shippingAddress{

        city
        provinceCode
        countryCode

      }


      lineItems(first:50){

        nodes{

          title
          quantity

        }

      }

    }

  }

}

`;



// -----------------------------------------------------
// Fetch orders
// -----------------------------------------------------

function buildSearchQuery(
  options:InsightsOptions,
):string {


  const filters:string[]=[];



  if(options.lastDays){


    const date = new Date();


    date.setDate(
      date.getDate() - options.lastDays
    );



    const formatted =
      date.toISOString()
      .split("T")[0];



    filters.push(
      `created_at:>=${formatted}`
    );

  }



  return filters.join(" ");

}




async function fetchOrdersForInsights(
  admin:GraphqlClient,
  options:InsightsOptions = {},
):Promise<ShopifyOrder[]> {


  const orders:ShopifyOrder[]=[];


  const limit =
    options.limit ?? 250;



  const query =
    buildSearchQuery(options);



  let cursor:string|null=null;

  let hasNextPage=true;



  while(
    hasNextPage &&
    orders.length < limit
  ){



    const response =
      await admin.graphql(
        INSIGHTS_ORDERS_QUERY,
        {
          variables:{
            cursor,
            query,
          },
        },
      );



    const data =
      await response.json();



    const page =
      data.data.orders;



    orders.push(
      ...(page.nodes as ShopifyOrder[])
    );



    hasNextPage =
      page.pageInfo.hasNextPage;



    cursor =
      page.pageInfo.endCursor;


  }



  return orders.slice(
    0,
    limit
  );

}



// -----------------------------------------------------
// Region
// -----------------------------------------------------

export function getOrdersByRegion(
  orders:ShopifyOrder[],
):RegionInsight[] {


  const counts =
    new Map<string,{
      label:string;
      count:number;
    }>();


  let totalWithRegion=0;



  for(const order of orders){


    const addr =
      order.shippingAddress;


    if(!addr || !addr.provinceCode)
      continue;



    totalWithRegion++;


    const key =
      `${addr.countryCode ?? ""}-${addr.provinceCode}`;



    const label =
      regionLabel(
        addr.provinceCode,
        addr.countryCode
      );



    const current =
      counts.get(key)
      ??
      {
        label,
        count:0,
      };



    current.count++;


    counts.set(
      key,
      current
    );


  }




  return Array.from(
    counts.entries()
  )
  .map(
    ([code,{label,count}])=>({

      code,

      label,

      orders:count,

      percentage:
        totalWithRegion
        ?
        Math.round(
          (count / totalWithRegion) * 1000
        ) / 10
        :
        0,

    })
  )
  .sort(
    (a,b)=>b.orders-a.orders
  );


}



// -----------------------------------------------------
// Cities
// -----------------------------------------------------

export function getTopCities(
  orders:ShopifyOrder[],
  limit=10,
):CityInsight[]{


  const counts =
    new Map<string,number>();



  for(const order of orders){


    const city =
      order.shippingAddress?.city?.trim();



    if(!city)
      continue;



    counts.set(
      city,
      (counts.get(city) ?? 0)+1
    );


  }



  return Array.from(
    counts.entries()
  )
  .map(
    ([city,count])=>({
      city,
      orders:count,
    })
  )
  .sort(
    (a,b)=>b.orders-a.orders
  )
  .slice(
    0,
    limit
  );

}



// -----------------------------------------------------
// Products
// -----------------------------------------------------

export function getProductsByRegion(
  orders:ShopifyOrder[],
  topPerRegion=5,
):RegionProducts[]{


  const regionMap =
    new Map<string,Map<string,number>>();




  for(const order of orders){


    const addr =
      order.shippingAddress;



    if(!addr || !addr.provinceCode)
      continue;



    const region =
      regionLabel(
        addr.provinceCode,
        addr.countryCode
      );



    const productMap =
      regionMap.get(region)
      ??
      new Map<string,number>();



    for(const item of order.lineItems.nodes){


      productMap.set(
        item.title,
        (productMap.get(item.title) ?? 0)
        +
        item.quantity
      );


    }



    regionMap.set(
      region,
      productMap
    );


  }



  return Array.from(
    regionMap.entries()
  )
  .map(
    ([region,products])=>({

      region,

      products:
        Array.from(
          products.entries()
        )
        .map(
          ([title,quantity])=>({
            title,
            quantity,
          })
        )
        .sort(
          (a,b)=>b.quantity-a.quantity
        )
        .slice(
          0,
          topPerRegion
        ),

    })
  );

}



// -----------------------------------------------------
// Summary
// -----------------------------------------------------

function getInsightsSummary(
  orders:ShopifyOrder[],
  regions:RegionInsight[],
):InsightsSummary {


  const products =
    new Map<string,number>();



  for(const order of orders){

    for(const item of order.lineItems.nodes){


      products.set(
        item.title,
        (products.get(item.title) ?? 0)
        +
        item.quantity
      );

    }

  }



  let bestSellingProduct:null| {
    title:string;
    quantity:number;
  } = null;




  for(
    const [title,quantity]
    of products
  ){


    if(
      !bestSellingProduct ||
      quantity > bestSellingProduct.quantity
    ){

      bestSellingProduct={
        title,
        quantity,
      };

    }

  }



  return {

    totalOrders:
      orders.length,


    topRegion:
      regions.length
      ?
      {
        label:regions[0].label,
        percentage:regions[0].percentage,
      }
      :
      null,


    bestSellingProduct,

  };


}



// -----------------------------------------------------
// Entry point
// -----------------------------------------------------

export async function buildInsights(
  admin:GraphqlClient,
  options:InsightsOptions = {},
):Promise<InsightsData>{


  const orders =
    await fetchOrdersForInsights(
      admin,
      options
    );



  const regions =
    getOrdersByRegion(orders);



  const topCities =
    getTopCities(orders);



  const productsByRegion =
    getProductsByRegion(orders);



  const summary =
    getInsightsSummary(
      orders,
      regions
    );



  return {

    totalScanned:
      orders.length,

    summary,

    regions,

    topCities,

    productsByRegion,

  };


}