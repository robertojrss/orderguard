import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";

import {
  buildEligibleAddressList,
  repairOrdersByIds,
  type ShopifyOrder,
} from "../services/address-repair.server";

import { ORDERS_QUERY } from "../services/orders.server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};


export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();

  const intent = formData.get("intent");


  if (intent === "repair") {

    const orderIds =
      formData.getAll("orderIds") as string[];


    const enableCountryRules =
      formData.get("countryRules") === "true";


    const result =
      await repairOrdersByIds(
        admin,
        orderIds,
        enableCountryRules
      );


    return {
      type: "repair" as const,
      ...result,
    };
  }



  const enableCountryRules =
    formData.get("countryRules") === "true";



  const response =
    await admin.graphql(ORDERS_QUERY);


  const data =
    await response.json();


  const orders: ShopifyOrder[] =
    data.data.orders.nodes;



  const eligible =
    buildEligibleAddressList(
      orders,
      enableCountryRules
    );



  return {
    type: "scan" as const,

    totalScanned:
      orders.length,

    countryRules:
      enableCountryRules,

    eligible:
      eligible.map(
        ({
          order,
          originalAddress1,
          recommendedAddress1,
          recommendedAddress2,
        }) => ({
          id: order.id,
          name: order.name,

          originalAddress1,

          recommendedAddress1,

          recommendedAddress2,
        })
      ),
  };

};



export default function AddressPage() {


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


      <s-section heading="📍 Address Formatter">


        <s-paragraph>
          Detects and fixes poorly formatted addresses
          that may prevent shipping label generation.
        </s-paragraph>



        <div
          style={{
            marginTop:16,
            marginBottom:20,
          }}
        >


          <scanFetcher.Form method="post">


            <input
              type="hidden"
              name="intent"
              value="scan"
            />


            <label
              style={{
                display:"block",
                marginBottom:12,
              }}
            >

              <input
                type="checkbox"
                name="countryRules"
                value="true"
                defaultChecked={false}
              />

              {" "}
              Enable country-specific formatting
              (BR 🇧🇷 / US 🇺🇸)

            </label>



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




        {
          scanResult && (

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
                need formatting.

              </s-paragraph>


            </>

          )
        }






        {
          scanResult &&
          scanResult.eligible.length > 0 && (


          <repairFetcher.Form method="post">


            <input
              type="hidden"
              name="intent"
              value="repair"
            />


            <input
              type="hidden"
              name="countryRules"
              value={
                scanResult.countryRules
                  ? "true"
                  : "false"
              }
            />



            <div
              style={{
                marginTop:24,
              }}
            >


              <s-table>


                <s-table-header-row>


                  <s-table-header>
                    
                  </s-table-header>


                  <s-table-header>
                    Order
                  </s-table-header>


                  <s-table-header>
                    Current Address
                  </s-table-header>


                  <s-table-header>
                    Recommended Address
                  </s-table-header>


                  <s-table-header>
                    Complement
                  </s-table-header>


                </s-table-header-row>





                <s-table-body>


                  {
                    scanResult.eligible.map(
                      (order)=> (

                      <s-table-row
                        key={order.id}
                      >


                        <s-table-cell>

                          <input
                            type="checkbox"
                            name="orderIds"
                            value={order.id}
                            defaultChecked
                          />

                        </s-table-cell>



                        <s-table-cell>

                          {order.name}

                        </s-table-cell>



                        <s-table-cell>

                          {order.originalAddress1}

                        </s-table-cell>



                        <s-table-cell>

                          {order.recommendedAddress1}

                        </s-table-cell>



                        <s-table-cell>

                          {
                            order.recommendedAddress2
                              ??
                              "-"
                          }

                        </s-table-cell>



                      </s-table-row>


                    ))
                  }


                </s-table-body>


              </s-table>


            </div>




            <div
              style={{
                marginTop:16,
              }}
            >


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


            </div>



          </repairFetcher.Form>


          )
        }







        {
          repairResult && (

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
                  {
                    repairResult.succeeded.length
                  }
                </strong>


                {" "}
                orders repaired successfully.


              </s-paragraph>




              {
                repairResult.stoppedAt && (

                <s-paragraph>


                  Stopped at order{" "}

                  <strong>
                    {
                      repairResult.stoppedAt.name
                    }
                  </strong>


                  :{" "}


                  {
                    repairResult.stoppedAt.error
                  }


                </s-paragraph>

                )
              }



            </>

          )
        }




      </s-section>


    </s-page>

  );

}