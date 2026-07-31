import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { useState } from "react";

import { requireFeature } from "../services/feature-access.server";

import {
  buildEligibleList,
  repairOrdersByIds,
} from "../services/cpf-repair.server";

import OrderFilters from "../components/OrderFilters";

import {
  getOrders,
  type ShopifyOrder,
} from "../services/orders.server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};


export const action = async ({ request }: ActionFunctionArgs) => {

  const ctx = await requireFeature({
    request,
    feature: "cpf",
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
    buildEligibleList(
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
          taxIdentifier
        }) => ({
          id: order.id,
          name: order.name,
          taxIdentifier,
        })
      ),
  };
};



export default function CpfPage() {


  const [filters, setFilters] =
    useState<{
      limit:number;
      lastDays?:number;
    }>({
      limit:250,
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

    <s-page heading="Order repair">


      <s-section heading="CPF/CNPJ para o campo empresa">


        <s-paragraph>
          Varre os pedidos da loja e encontra os que têm CPF/CNPJ salvo em
          localizedFields mas o campo empresa do endereço está vazio.
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
                  ? "Escaneando..."
                  : "Escanear pedidos"
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
              pedidos analisados.

              {" "}

              <strong>
                {scanResult.eligible.length}
              </strong>

              {" "}
              elegíveis.

            </s-paragraph>


          </>

        )}






        {scanResult &&
        scanResult.eligible.length > 0 && (


          <repairFetcher.Form method="post">


            <input
              type="hidden"
              name="intent"
              value="repair"
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
                    Pedido
                  </s-table-header>

                  <s-table-header>
                    CPF/CNPJ encontrado
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

                            <input
                              type="checkbox"
                              name="orderIds"
                              value={o.id}
                              defaultChecked
                            />

                          </s-table-cell>


                          <s-table-cell>
                            {o.name}
                          </s-table-cell>


                          <s-table-cell>
                            {o.taxIdentifier}
                          </s-table-cell>


                        </s-table-row>

                      )
                    )
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
                    ? "Reparando..."
                    : "Repair selected"
                }


              </s-button>


            </div>



          </repairFetcher.Form>


        )}






        {repairResult && (

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
                {repairResult.succeeded.length}
              </strong>

              {" "}
              pedidos corrigidos com sucesso.

            </s-paragraph>



            {
              repairResult.stoppedAt && (

                <s-paragraph>

                  Parado no pedido{" "}

                  <strong>
                    {repairResult.stoppedAt.name}
                  </strong>

                  :

                  {" "}
                  {repairResult.stoppedAt.error}

                </s-paragraph>

              )
            }


          </>

        )}


      </s-section>


    </s-page>

  );

}