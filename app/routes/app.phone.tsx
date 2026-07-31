import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { requireFeature } from "../services/feature-access.server";

import {
  buildEligiblePhoneList,
  repairOrdersByIds,
} from "../services/phone-repair.server";

import {
  getOrders,
  type ShopifyOrder,
} from "../services/orders.server";

import OrderFilters from "../components/OrderFilters";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};


export const action = async ({ request }: ActionFunctionArgs) => {

  const ctx = await requireFeature({
    request,
    feature: "phone",
  });

  const formData = await request.formData();

  const intent = formData.get("intent");


  if (intent === "repair") {

    const orderIds =
      formData.getAll("orderIds") as string[];

    const result =
      await repairOrdersByIds(
        ctx.admin,
        orderIds
      );

    await ctx.finish(
      result.succeeded.length
    );

    return {
      type: "repair" as const,
      ...result,
    };
  }


  const limit =
    Number(
      formData.get("limit") ?? 250
    );


  const lastDaysValue =
    formData.get("lastDays");


  const lastDays =
    lastDaysValue
      ? Number(lastDaysValue)
      : undefined;



  const orders: ShopifyOrder[] =
    await getOrders(
      ctx.admin,
      {
        limit,
        lastDays,
      }
    );


  const eligible =
    buildEligiblePhoneList(
      orders
    );


  await ctx.finish(
    orders.length
  );


  return {
    type: "scan" as const,

    totalScanned:
      orders.length,

    eligible:
      eligible.map(
        ({
          order,
          originalPhone,
          recommendedPhone
        }) => ({
          id: order.id,
          name: order.name,
          originalPhone,
          recommendedPhone,
        })
      ),
  };
};



export default function PhonePage() {


const [filters, setFilters] =
  useState<{
    limit: number;
    lastDays?: number;
  }>({
    limit: 250,
  });


  const scanFetcher =
    useFetcher<typeof action>();


  const repairFetcher =
    useFetcher<typeof action>();


  const isScanning =
    scanFetcher.state !== "idle";


  const isRepairing =
    repairFetcher.state !== "idle";



  const scanResult =
    scanFetcher.data?.type === "scan"
      ? scanFetcher.data
      : null;


  const repairResult =
    repairFetcher.data?.type === "repair"
      ? repairFetcher.data
      : null;



  return (

    <s-page heading="Order Repair">


      <s-section heading="📞 Phone Number Formatter">


        <s-paragraph>
          Scans store orders and finds phone numbers that can be normalized
          into a standard international format.
        </s-paragraph>



        <div
          style={{
            marginTop:16,
            marginBottom:20,
          }}
        >


          <OrderFilters
            values={filters}
            onChange={setFilters}
          />



          <scanFetcher.Form method="post">


            <input
              type="hidden"
              name="intent"
              value="scan"
            />


            <input
              type="hidden"
              name="limit"
              value={filters.limit}
            />


            <input
              type="hidden"
              name="lastDays"
              value={filters.lastDays ?? ""}
            />



            <s-button
              type="submit"
              disabled={isScanning}
            >

              {
                isScanning
                  ? "Analyzing..."
                  : "Analyze Orders"
              }

            </s-button>


          </scanFetcher.Form>


        </div>





        {scanResult && (

          <>

            <hr
              style={{
                border:"none",
                borderTop:"1px solid #e1e3e5",
                margin:"20px 0",
              }}
            />


            <s-paragraph>

              <strong>
                {scanResult.totalScanned}
              </strong>

              {" "}
              orders analyzed.

              {" "}

              <strong>
                {scanResult.eligible.length}
              </strong>

              {" "}
              eligible.

            </s-paragraph>


          </>

        )}






        {
          scanResult &&
          scanResult.eligible.length > 0 && (

          <repairFetcher.Form method="post">


            <input
              type="hidden"
              name="intent"
              value="repair"
            />


            {
              scanResult.eligible.map(
                (o)=>(
                  <input
                    key={o.id}
                    type="hidden"
                    name="orderIds"
                    value={o.id}
                  />
                )
              )
            }



            <s-table>

              <s-table-header-row>

                <s-table-header>
                  Order
                </s-table-header>

                <s-table-header>
                  Current Phone
                </s-table-header>

                <s-table-header>
                  Recommended Phone
                </s-table-header>

              </s-table-header-row>


              <s-table-body>

                {
                  scanResult.eligible.map(
                    (o)=>(
                      <s-table-row
                        key={o.id}
                      >

                        <s-table-cell>
                          {o.name}
                        </s-table-cell>

                        <s-table-cell>
                          {o.originalPhone}
                        </s-table-cell>

                        <s-table-cell>
                          {o.recommendedPhone}
                        </s-table-cell>


                      </s-table-row>
                    )
                  )
                }

              </s-table-body>


            </s-table>


            <s-button
              type="submit"
              disabled={isRepairing}
            >
              {
                isRepairing
                  ? "Repairing..."
                  : "Repair selected"
              }
            </s-button>


          </repairFetcher.Form>

        )}





        {
          repairResult && (

            <s-paragraph>

              <strong>
                {repairResult.succeeded.length}
              </strong>

              {" "}
              orders repaired successfully.

            </s-paragraph>

          )
        }



      </s-section>


    </s-page>

  );

}