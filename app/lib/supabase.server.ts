import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";

globalThis.WebSocket ??= WebSocket as typeof globalThis.WebSocket;

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);