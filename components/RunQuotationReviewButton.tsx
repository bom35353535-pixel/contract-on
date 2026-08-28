"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunQuotationReviewButton({ contractId, rerun = false }: { contractId: string; rerun?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function runReview() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/quotation-review`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "견적검토를 실행하지 못했습니다.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "견적검토를 실행하지 못했습니다.");
      setBusy(false);
    }
  }

  return <div className="run-review-action"><button type="button" disabled={busy} onClick={runReview}>{busy ? "등록자료 검색·검산 중…" : rerun ? "등록자료로 다시 검토" : "견적검토 실행"}</button>{error && <p>{error}</p>}</div>;
}
