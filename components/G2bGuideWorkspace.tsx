"use client";

import { useEffect, useState } from "react";

type G2bGuideStep = {
  number: string;
  title: string;
  phase: string;
  menuPath: string[];
  actions: string[];
  note: string;
  sourcePages: string;
  imageCount: number;
};

const G2B_GUIDE_STEPS: G2bGuideStep[] = [
  {
    number: "01",
    title: "발주계획 등록",
    phase: "공고 전 준비",
    menuPath: ["발주", "발주계획", "발주계획목록"],
    actions: ["신규", "업무구분: 공사", "발주계획", "저장"],
    note: "공사명, 공사기간, 추정가격, 계약방법, 업종과 지역제한 등 발주계획 정보를 입력합니다.",
    sourcePages: "PDF 1~3쪽 (교재 284~286쪽)",
    imageCount: 3,
  },
  {
    number: "02",
    title: "시설공사 입찰공고",
    phase: "공고 집행",
    menuPath: ["입찰", "입찰계약/낙찰", "입찰공고목록"],
    actions: ["신규", "임시저장", "결재요청", "공고게시"],
    note: "계약방법, 공고일정, 참가자격, 업종·지역제한, 기초금액과 공고서를 확인한 뒤 결재 및 게시합니다.",
    sourcePages: "PDF 4~25쪽 (교재 287~308쪽)",
    imageCount: 22,
  },
  {
    number: "03",
    title: "개찰",
    phase: "공고 개찰",
    menuPath: ["입찰", "입찰계약/낙찰", "개찰목록"],
    actions: ["개찰시작", "입찰서 복호화", "개찰완료"],
    note: "입찰서 접수 마감 후 개찰을 시작하고, 인증서로 입찰서를 복호화한 뒤 예비가격과 개찰결과를 확인합니다.",
    sourcePages: "PDF 26~37쪽 (교재 309~320쪽)",
    imageCount: 12,
  },
  {
    number: "04",
    title: "사후판정",
    phase: "적격 여부 확인",
    menuPath: ["입찰공고", "입찰공고작성", "일반보고서"],
    actions: ["입찰조서", "법인등기부등본/사업자등록상태 조회", "부정당제재내역 조회", "조세포탈내역 조회"],
    note: "1순위 투찰자의 대표자·입찰참가자를 확인하고 업체 상태, 부정당제재 및 조세포탈 여부를 조회합니다.",
    sourcePages: "PDF 38~41쪽 (교재 321~324쪽)",
    imageCount: 4,
  },
  {
    number: "05",
    title: "낙찰자 선정",
    phase: "낙찰 결정",
    menuPath: ["입찰", "입찰계약/낙찰", "낙찰자선정 목록"],
    actions: ["업체정보 확인", "선정", "저장", "낙찰결과보고서"],
    note: "참가업체의 결격 여부를 확인한 뒤 낙찰자를 선택하고 결과를 저장합니다.",
    sourcePages: "PDF 42~55쪽 (교재 325~338쪽)",
    imageCount: 14,
  },
  {
    number: "06",
    title: "계약서 작성·송신",
    phase: "계약 체결",
    menuPath: ["계약", "계약체결", "계약체결관리 목록"],
    actions: ["신규작성", "저장", "전자서명", "송신"],
    note: "문서정보, 계약자, 계약내용과 보증정보를 입력하고 업체 상태를 검증한 뒤 계약서를 전자서명하여 송신합니다.",
    sourcePages: "PDF 56~72쪽 (교재 339~355쪽)",
    imageCount: 17,
  },
  {
    number: "07",
    title: "계약보증서 접수",
    phase: "보증 확인",
    menuPath: ["공통", "보증", "보증접수"],
    actions: ["보증서관리명", "접수"],
    note: "계약보증서의 보증기간, 보증금액과 처리상태를 확인하고 접수합니다.",
    sourcePages: "PDF 73~78쪽 (교재 356~361쪽)",
    imageCount: 6,
  },
  {
    number: "08",
    title: "검사검수",
    phase: "준공 확인",
    menuPath: ["이행", "검사검수", "검사검수목록"],
    actions: ["접수", "준공확인서", "확인서 송신"],
    note: "업체가 제출한 검사·검수 요청과 준공서류를 확인하고 검사결과를 작성하여 확인서를 송신합니다.",
    sourcePages: "PDF 79~85쪽 (교재 362~368쪽)",
    imageCount: 7,
  },
  {
    number: "09",
    title: "대금지급",
    phase: "대금 청구 처리",
    menuPath: ["이행", "대금관리", "대금관리목록"],
    actions: ["대금청구번호", "세금계산서", "접수", "업체정보 확인"],
    note: "대금청구서와 세금계산서를 확인·출력하고 접수한 뒤 업체·위임·채권 정보를 확인합니다.",
    sourcePages: "PDF 86~93쪽 (교재 369~376쪽)",
    imageCount: 8,
  },
];

function G2bScreenViewer({ step, title, count }: { step: string; title: string; count: number }) {
  const [current, setCurrent] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const fileName = String(current).padStart(2, "0");
  const imageUrl = `/g2b-guide/${step}/${fileName}.webp`;

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [expanded]);

  return <><section className="g2b-screen-viewer" aria-label={`${title} 실습 화면`}>
    <header>
      <div>
        <strong>실습 화면</strong>
        <span>{current} / {count}</span>
      </div>
      <div className="g2b-screen-controls">
        <button type="button" onClick={() => setCurrent((value) => Math.max(1, value - 1))} disabled={current === 1}>이전 화면</button>
        <label>
          <span className="sr-only">실습 화면 선택</span>
          <select value={current} onChange={(event) => setCurrent(Number(event.target.value))}>
            {Array.from({ length: count }, (_, index) => <option key={index + 1} value={index + 1}>화면 {index + 1}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setCurrent((value) => Math.min(count, value + 1))} disabled={current === count}>다음 화면</button>
        <button type="button" className="g2b-enlarge-button" onClick={() => setExpanded(true)}>크게 보기</button>
      </div>
    </header>
    <div className="g2b-screen-frame">
      <img src={imageUrl} alt={`${title} 나라장터 실습 화면 ${current}`} loading="lazy" />
    </div>
  </section>
  {expanded && <div className="g2b-image-modal" role="dialog" aria-modal="true" aria-label={`${title} 실습 화면 크게 보기`} onMouseDown={(event) => {
    if (event.target === event.currentTarget) setExpanded(false);
  }}>
    <div className="g2b-image-modal-panel">
      <header>
        <div><strong>{title}</strong><span>화면 {current} / {count}</span></div>
        <button type="button" onClick={() => setExpanded(false)} autoFocus>닫기</button>
      </header>
      <div className="g2b-image-modal-body"><img src={imageUrl} alt={`${title} 나라장터 실습 화면 ${current} 크게 보기`} /></div>
    </div>
  </div>}
  </>;
}

export function G2bGuideWorkspace({ contractId }: { contractId: string }) {
  return <>
    <section className="g2b-guide-head">
      <div>
        <span className="section-kicker">나라장터 업무 안내</span>
        <h2>나라장터에서 눌러야 할 메뉴</h2>
        <p>첨부된 「나라장터 실습하기」 자료에 나온 시설공사 수의계약 절차를 실제 처리 순서대로 정리했습니다.</p>
      </div>
      <a className="g2b-next-link" href={`/contracts/${contractId}?tab=commitment`}>원인행위로 이동 →</a>
    </section>

    <section className="g2b-source-note" aria-label="자료 이용 안내">
      <strong>이용 방법</strong>
      <span>현재 처리할 단계를 펼친 뒤 <b>메뉴 경로</b>와 <b>화면에서 누를 버튼</b>을 차례대로 확인해 주세요.</span>
      <small>근거: 나라장터 실습하기.pdf 284~376쪽 · 화면 개편 시 실제 나라장터 메뉴와 다를 수 있습니다. [확인 필요]</small>
    </section>

    <div className="g2b-guide-list">
      {G2B_GUIDE_STEPS.map((step, index) => <details className="g2b-guide-step" key={step.number} open={index === 0}>
        <summary>
          <span className="g2b-step-number">{step.number}</span>
          <span className="g2b-step-title"><small>{step.phase}</small><strong>{step.title}</strong></span>
          <span className="g2b-summary-path">{step.menuPath.join(" › ")}</span>
          <span className="g2b-expand-label">열기</span>
        </summary>
        <div className="g2b-step-body">
          <div className="g2b-path-panel">
            <span>메뉴 경로</span>
            <ol>{step.menuPath.map((menu) => <li key={menu}>{menu}</li>)}</ol>
          </div>
          <div className="g2b-action-panel">
            <span>화면에서 누를 버튼·항목</span>
            <div>{step.actions.map((action, actionIndex) => <span key={action} className="g2b-action-chip"><b>{actionIndex + 1}</b>{action}</span>)}</div>
          </div>
          <p>{step.note}</p>
          <small className="g2b-source-pages">{step.sourcePages}</small>
          <G2bScreenViewer step={step.number} title={step.title} count={step.imageCount} />
        </div>
      </details>)}
    </div>
  </>;
}
