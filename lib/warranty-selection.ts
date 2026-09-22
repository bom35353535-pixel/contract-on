export type WarrantyCriterionChoice = {
  id: string;
  category: string;
  workName: string;
};

export function suggestWarrantyCriterion<T extends WarrantyCriterionChoice>(criteria: T[], projectName: string, constructionType: string) {
  const work = `${projectName} ${constructionType}`.replace(/\s+/g, "");
  const byId = (id: string) => criteria.find((criterion) => criterion.id === id);
  if (/환경개선|실내|인테리어|의장|미장|타일|도장|창호|보링|판금|보일러|건축물조립/.test(work)) return byId("W06");
  if (/방수|지붕|승강기|인양기계|콘크리트포장/.test(work)) return byId("W04");
  if (/기둥|내력벽|주요구조부|골조/.test(work)) return byId("W03");
  if (/전기/.test(work)) return byId("W09");
  if (/통신|방송/.test(work)) return byId("W10");
  return criteria.find((criterion) => criterion.workName.includes(constructionType) || constructionType.includes(criterion.category));
}
