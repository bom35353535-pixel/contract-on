"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdvanceStageButton({ contractId, label }: { contractId: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function advance() {
    if (!window.confirm(`실제 행정처리를 완료하셨나요?\n확인하면 '${label}'로 기록됩니다.`)) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/contracts/${contractId}/advance`, { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "단계를 변경하지 못했습니다.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "단계를 변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="advance-action">
      <button type="button" onClick={advance} disabled={pending}>{pending ? "처리 중…" : label}</button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
