import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getD1() {
  if (!env.DB) {
    throw new Error("계약 데이터베이스 연결을 사용할 수 없습니다.");
  }
  return env.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}
