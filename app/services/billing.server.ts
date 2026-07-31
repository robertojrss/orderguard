import { supabase } from "../lib/supabase.server";

export type Plan =
  | "free"
  | "pro"
  | "business"
  | "enterprise";

export type Feature =
  | "health"
  | "address"
  | "phone"
  | "email"
  | "zip"
  | "cpf"
  | "insights";

interface ShopRecord {
  shop: string;
  plan: Plan;
}

interface UsageRecord {
  shop: string;
  feature_slug: Feature;
  month: string;
  executions: number;
  orders_processed: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function registerShop(
  shop: string,
): Promise<void> {

  const existing =
    await getShop(shop);

  if (existing) {
    return;
  }

  const { error } =
    await supabase
      .from("shops")
      .insert({
        shop,
        plan: "free",
      });

  if (error) {
    throw error;
  }

}

export async function getShop(
  shop: string,
): Promise<ShopRecord | null> {

  const { data, error } =
    await supabase
      .from("shops")
      .select("*")
      .eq("shop", shop)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ShopRecord | null;
}

export async function ensureShopExists(
  shop: string,
): Promise<void> {

  const existing =
    await getShop(shop);

  if (existing) {
    return;
  }

  await registerShop(shop);

}

export async function getPlan(
  shop: string,
): Promise<Plan> {

  await ensureShopExists(shop);

  const record =
    await getShop(shop);

  if (!record) {
    return "free";
  }

  return record.plan;

}

export async function setPlan(

  shop: string,

  plan: Plan,

): Promise<void> {

  const { error } =
    await supabase
      .from("shops")
      .update({
        plan,
      })
      .eq("shop", shop);

  if (error) {
    throw error;
  }
}

export async function getFeatureLimit(

  plan: Plan,

  feature: Feature,

): Promise<number> {

  const { data, error } =
    await supabase
      .from("feature_limits")
      .select("monthly_limit")
      .eq("plan", plan)
      .eq("feature_slug", feature)
      .single();

  if (error) {
    throw error;
  }

  return data.monthly_limit;
}

export async function getUsage(

  shop: string,

  feature: Feature,

): Promise<UsageRecord | null> {

  const { data, error } =
    await supabase
      .from("usage")
      .select("*")
      .eq("shop", shop)
      .eq("feature_slug", feature)
      .eq("month", currentMonth())
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data as UsageRecord | null;
}



export async function getOrCreateUsage(

  shop: string,

  feature: Feature,

): Promise<UsageRecord> {

  let usage =
    await getUsage(
      shop,
      feature,
    );

  if (usage) {
    return usage;
  }

  const newUsage: UsageRecord = {

    shop,

    feature_slug: feature,

    month: currentMonth(),

    executions: 0,

    orders_processed: 0,

  };

  const { error } =
    await supabase
      .from("usage")
      .insert(newUsage);

  if (error) {
    throw error;
  }

  return newUsage;
}



export async function incrementUsage(

  shop: string,

  feature: Feature,

  ordersProcessed: number,

): Promise<void> {

  const usage =
    await getOrCreateUsage(
      shop,
      feature,
    );

  const { error } =
    await supabase
      .from("usage")
      .update({

        executions:
          usage.executions + 1,

        orders_processed:
          usage.orders_processed +
          ordersProcessed,

      })
      .eq("shop", shop)
      .eq("feature_slug", feature)
      .eq("month", currentMonth());

  if (error) {
    throw error;
  }

}



export async function getRemainingUsage(

  shop: string,

  feature: Feature,

): Promise<number> {

  const plan =
    await getPlan(shop);

  const limit =
    await getFeatureLimit(
      plan,
      feature,
    );

  const usage =
    await getOrCreateUsage(
      shop,
      feature,
    );

  return Math.max(

    limit -
      usage.orders_processed,

    0,

  );

}



export async function canUseFeature(

  shop: string,

  feature: Feature,

  amount = 1,

): Promise<boolean> {

  const plan =
    await getPlan(shop);

  const limit =
    await getFeatureLimit(
      plan,
      feature,
    );

  const usage =
    await getOrCreateUsage(
      shop,
      feature,
    );

  return (

    usage.orders_processed +
      amount

    <=

    limit

  );

}



export async function getUsageSummary(

  shop: string,

  feature: Feature,

) {

  const plan =
    await getPlan(shop);

  const limit =
    await getFeatureLimit(
      plan,
      feature,
    );

  const usage =
    await getOrCreateUsage(
      shop,
      feature,
    );

  return {

    plan,

    limit,

    used:
      usage.orders_processed,

    remaining:
      Math.max(
        limit -
          usage.orders_processed,
        0,
      ),

    executions:
      usage.executions,

    month:
      currentMonth(),

  };

}

export async function requireFeatureAccess(

  shop: string,

  feature: Feature,

  amount = 1,

): Promise<void> {

  const allowed =
    await canUseFeature(
      shop,
      feature,
      amount,
    );

  if (!allowed) {

    throw new Error(
      `Monthly ${feature} limit reached.`,
    );

  }

}

export async function trackFeatureUsage(

  shop: string,

  feature: Feature,

  processed: number,

): Promise<void> {

  await incrementUsage(

    shop,

    feature,

    processed,

  );

}