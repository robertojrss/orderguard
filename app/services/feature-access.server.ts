import { authenticate } from "../shopify.server";

import {
  Feature,
  ensureShopExists,
  requireFeatureAccess,
  trackFeatureUsage,
  getPlan,
} from "./billing.server";

export interface FeatureContext {

  admin: Awaited<
    ReturnType<typeof authenticate.admin>
  >["admin"];

  session: Awaited<
    ReturnType<typeof authenticate.admin>
  >["session"];

  shop: string;

  plan: string;

  finish(
    processed: number,
  ): Promise<void>;

}

interface RequireFeatureOptions {

  request: Request;

  feature: Feature;

  amount?: number;

}

export async function requireFeature({

  request,

  feature,

  amount = 1,

}: RequireFeatureOptions): Promise<FeatureContext> {

  const {
    admin,
    session,
  } =
    await authenticate.admin(request);

  const shop =
    session.shop;

  await ensureShopExists(
    shop,
  );

  await requireFeatureAccess(

    shop,

    feature,

    amount,

  );

  const plan =
    await getPlan(shop);

  return {

    admin,

    session,

    shop,

    plan,

    async finish(
      processed: number,
    ) {

      await trackFeatureUsage(

        shop,

        feature,

        processed,

      );

    },

  };

}