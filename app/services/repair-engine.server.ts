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


export type GraphqlClient = {
  graphql: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
    }
  ) => Promise<Response>;
};



export interface RepairEngineConfig<T> {

  fetchOrdersByIds: (
    admin: GraphqlClient,
    ids: string[]
  ) => Promise<T[]>;


  detectEligible: (
    orders: T[]
  ) => RepairItem<T>[];


  applyRepair: (
    admin: GraphqlClient,
    item: RepairItem<T>
  ) => Promise<
    {
      ok: true;
    }
    |
    {
      ok:false;
      error:string;
    }
  >;

}



export interface RepairItem<T> {

  order:T;

  id:string;

  name:string;

}



export async function runRepairEngine<T>(
  admin:GraphqlClient,
  ids:string[],
  config:RepairEngineConfig<T>
):Promise<RepairResult>{


  if(ids.length === 0){

    return {
      succeeded:[],
      stoppedAt:null
    };

  }



  const orders =
    await config.fetchOrdersByIds(
      admin,
      ids
    );



  const eligible =
    config.detectEligible(
      orders
    );



  const succeeded:RepairSuccess[]=[];



  for(const item of eligible){


    const result =
      await config.applyRepair(
        admin,
        item
      );



    if(!result.ok){

      return {

        succeeded,

        stoppedAt:{

          id:item.id,

          name:item.name,

          error:
            result.error

        }

      };

    }



    succeeded.push({

      id:item.id,

      name:item.name

    });


  }



  return {

    succeeded,

    stoppedAt:null

  };


}