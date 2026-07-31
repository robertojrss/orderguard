import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic } = await authenticate.webhook(request);

  console.log(`Compliance webhook received: ${topic}`);

  return new Response(null, { status: 200 });
};