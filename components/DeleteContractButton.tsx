"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteContractButton({ contractId, projectName }: { contractId: string; projectName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function removeContract() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/contracts/${contractId}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "공사를 삭제하지 못했습니다.");
      setOpen(false);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "공사를 삭제하지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <>
      <button className="delete-contract-trigger" type="button" onClick={() => { setError(""); setOpen(true); }}>삭제</button>
      {open && <div className="delete-contract-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setOpen(false); }}>
        <section className="delete-contract-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`delete-title-${contractId}`} aria-describedby={`delete-description-${contractId}`}>
          <h2 id={`delete-title-${contractId}`}>진행 중 공사를 삭제할까요?</h2>
          <p id={`delete-description-${contractId}`}><strong>{projectName}</strong><br />계약 진행정보와 제출서류가 함께 삭제되며 되돌릴 수 없습니다.</p>
          {error && <p className="delete-contract-error" role="alert">{error}</p>}
          <div className="delete-contract-actions">
            <button type="button" disabled={busy} onClick={() => setOpen(false)}>취소</button>
            <button className="confirm-delete" type="button" disabled={busy} onClick={removeContract}>{busy ? "삭제 중…" : "삭제"}</button>
          </div>
        </section>
      </div>}
    </>
  );
}
