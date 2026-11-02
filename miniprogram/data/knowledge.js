// 人工核对后的原创概括。页码均为用户所提供 PDF 的一基页序号，不是纸书页码。
// 外部书目只有目录级候选信息，未导入全文，也不参与自动训练计算。
const cards = [
  { id: 'daniels-purpose', title: '每次训练先明确目的', topic: '训练原则', keywords: ['训练', '目的', '强度', '原则'], summary: '先确定这次训练要改善什么，再选择训练类型与剂量。用更快配速或更多疲劳衡量训练价值，可能偏离原本目标。', chapter: '第4章 选择恰当的训练类型', pdfPages: [60], evidence: '已核对原书', sourceId: 'daniels-3-cn' },
  { id: 'daniels-easy', title: 'E 跑以舒适、可交谈为主', topic: '轻松跑', keywords: ['轻松', '慢跑', '配速', 'E', '长跑', '心率'], summary: '轻松跑承担有氧基础、热身、放松和训练间恢复等用途。状态与环境会影响当天配速；明显疲劳时可以缩短训练或休息。', chapter: '第4章 轻松跑', pdfPages: [62], evidence: '已核对原书', sourceId: 'daniels-3-cn' },
  { id: 'daniels-current', title: '依据当前表现设定训练配速', topic: '能力评估', keywords: ['VDOT', '能力', '成绩', 'PB', '预测', '比赛', '配速'], summary: '近期有代表性的比赛成绩可以作为训练能力的基准。VDOT 是表现模型，不能等同于实验室测得的最大摄氧量；跨距离的等效成绩依赖专项准备与相近比赛条件。', chapter: '第5章 用 VDOT 设定训练配速', pdfPages: [87, 88, 89, 92], evidence: '已核对原书', sourceId: 'daniels-3-cn' },
  { id: 'daniels-rest', title: '恢复日也是训练的一部分', topic: '恢复', keywords: ['恢复', '休息', '休整', '疲劳', '伤', '停跑'], summary: '轻松日与休息服务于高质量训练后的恢复。中断后应下调训练量和强度，不通过补课式堆量追赶原计划；持续伤痛需要专业评估。', chapter: '第15章 休整期和辅助训练', pdfPages: [258, 261, 263], evidence: '已核对原书', sourceId: 'daniels-3-cn' },
  { id: 'daniels-long', title: '长跑要与周跑量相匹配', topic: '训练负荷', keywords: ['长跑', '长距离', '跑量', '周跑量', '负荷'], summary: '长跑并非越长越好，应结合稳定周跑量、训练水平和恢复情况设置上限。原书给出按周跑量分组的建议；首版只提供保守基础周，不自动生成马拉松专项长跑。', chapter: '第4章 长距离跑以及增加跑量', pdfPages: [62], evidence: '已核对原书', sourceId: 'daniels-3-cn' },
  { id: 'sleep-consensus', title: '睡眠需要结合个人需求判断', topic: '恢复', keywords: ['恢复', '睡眠', '睡觉', '疲劳'], summary: '2021 年专家共识讨论睡眠对运动恢复的作用，也指出运动员的睡眠需求存在个体差异。应用应记录睡眠趋势与主观状态，不能只凭一晚时长判断是否完全恢复。', chapter: 'Walsh 等，2021，专家共识', pdfPages: [], evidence: '已查阅共识摘要与建议', sourceId: 'sleep-2021', url: 'https://bjsm.bmj.com/content/55/7/356' },
  { id: 'exercise-redflags', title: '明显不适先寻求医疗评估', topic: '安全', keywords: ['胸痛', '晕厥', '气短', '就医'], summary: '运动中出现胸痛、晕厥或异常气短时，应暂停运动并寻求医疗评估。应用只提示停止自动训练建议，无法判断症状病因或作出诊断。', chapter: 'ACSM 运动测试与处方指南公开节选；应用保守暂停规则', pdfPages: [], evidence: '已查阅公开指南相关节选', sourceId: 'acsm-guidelines-excerpt', url: 'https://www.acsm.org/docs/default-source/publications-files/acsm-guidelines-download-10th-edabf32a97415a400e9b3be594a6cd7fbf.pdf' }
]
const sources = [
  { id: 'daniels-3-cn', title: '丹尼尔斯经典跑步训练法', author: 'Jack Daniels', edition: '中文译本，对应英文第三版（2014）', status: '已核对相关章节', scope: '训练类型、VDOT、恢复与基础训练原则', rights: '用户提供 PDF；公开全文检索与内容分发授权尚未确认', pdfPageCount: 286 },
  { id: 'daniels-4', title: 'Daniels’ Running Formula', author: 'Jack Daniels', edition: '第四版（2022）', status: '候选；已核对出版信息，未导入全文', scope: '比较第三版与第四版的规则变化', url: 'https://us.humankinetics.com/products/daniels-running-formula-4th-edition' },
  { id: 'advanced-marathoning', title: 'Advanced Marathoning', author: 'Pete Pfitzinger / Scott Douglas', edition: '第四版（2026）', status: '候选；已核对出版信息，未导入全文', scope: '马拉松专项、减量、恢复与营养', url: 'https://us.humankinetics.com/products/advanced-marathoning-4th-edition' },
  { id: 'science-running', title: 'The Science of Running', author: 'Steve Magness', edition: '版本待用户材料核对', status: '候选；已查阅作者介绍，未导入全文', scope: '训练机制、个体差异与方法比较', url: 'https://www.stevemagness.com/books/' },
  { id: 'sleep-2021', title: 'Sleep and the athlete', author: 'Walsh 等', edition: '2021 专家共识；DOI 10.1136/bjsports-2020-102025', status: '已查阅相关建议', scope: '睡眠与恢复', url: 'https://bjsm.bmj.com/content/55/7/356' },
  { id: 'acsm-guidelines-excerpt', title: 'ACSM’s Guidelines for Exercise Testing and Prescription', author: 'ACSM', edition: '第10版公开节选；未审读最新版全书', status: '已查阅相关公开节选', scope: '运动相关不适的专业评估提示', url: 'https://www.acsm.org/docs/default-source/publications-files/acsm-guidelines-download-10th-edabf32a97415a400e9b3be594a6cd7fbf.pdf' }
]
function searchKnowledge(query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return cards
  return cards.map(card => ({ card, score: card.keywords.reduce((n, key) => n + (q.includes(key.toLowerCase()) ? 1 : 0), 0) + (card.title.toLowerCase().includes(q) ? 2 : 0) }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score).map(item => item.card)
}
module.exports = { cards, sources, searchKnowledge }
