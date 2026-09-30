import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SeoulEdNavigator } from "@/components/SeoulEdNavigator";
import { listContracts } from "@/lib/contracts";

export const metadata: Metadata = {
  title: "서울교육 사이트 찾기 | 계약ON",
  description: "업무명으로 서울교육 행정업무 사이트를 찾는 내비게이터",
};

export default async function NavigatorPage() {
  const contracts = await listContracts();
  return <AppShell active="navigator" contractCount={contracts.length}>
    <SeoulEdNavigator />
  </AppShell>;
}
