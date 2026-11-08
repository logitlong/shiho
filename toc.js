// 科目与讲次目录
// 视频：YouTube「司法試験・予備試験合格講座」的公开版播放列表（会员版不能嵌入）
// 讲次列表在 lectures.js（从播放列表生成）。
// 讲次 id：<科目id>-<三位讲次>，例如 kenpo-001。录入后不要改，学习记录按 id 存。
// 入试科目：筑波大学法科大学院 既修者 = 憲法・民法・刑法・民訴・刑訴
import { KENPO, MINPO, KAZOKU, KEIHO, MINSO, KEISO } from "./lectures.js?v=f577329c32";

export const SUBJECTS = [
  { id: "kenpo", title: "憲法", zh: "宪法", playlist: "PL_VnGGDz34KSesY7KqjmNiIR3xatmU09F", raw: KENPO },
  { id: "minpo", title: "民法", zh: "民法（总则・物权・债权）", playlist: "PL_VnGGDz34KSMB86xzIGacwCUyN84Qh97", raw: MINPO },
  { id: "kazoku", title: "民法（親族・相続）", zh: "民法（亲属・继承）", playlist: "PL_VnGGDz34KQ8289c-AMm74id5GNLp4Rw", raw: KAZOKU },
  { id: "keiho", title: "刑法", zh: "刑法", playlist: "PL_VnGGDz34KR0BivWeuGkt0eT3Cm3VLBI", raw: KEIHO },
  { id: "minso", title: "民事訴訟法", zh: "民事诉讼法", playlist: "PL_VnGGDz34KSt80HxQk2dWazcnUiRq_Lj", raw: MINSO },
  { id: "keiso", title: "刑事訴訟法", zh: "刑事诉讼法", playlist: "PL_VnGGDz34KQ3Js603seTdUsluRC6lQYE", raw: KEISO },
];

for (const s of SUBJECTS) {
  s.lectures = s.raw.map(([video, title, dur], i) => ({
    id: `${s.id}-${String(i + 1).padStart(3, "0")}`, n: i + 1, subject: s.id, video,
    title: title.replace(/[、，,\s]+$/, ""), dur,
  }));
  s.dur = s.lectures.reduce((a, l) => a + l.dur, 0);
}
export const LECTURES = SUBJECTS.flatMap((s) => s.lectures);
export const LECTURE_BY_ID = Object.fromEntries(LECTURES.map((l) => [l.id, l]));
export const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));
