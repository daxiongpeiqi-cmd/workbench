/* =========================================================================
 * 提分案例库（解读系统）
 * --------------------------------------------------------------------------
 * 数据来源：胡源老师学员（当前以数学为主，持续补充）
 * 匿名规则：考生姓名 → 姓 + "某" + 名字末字（如 马晓笛→马某笛、王瀚卿→王某卿）
 *           全名仅两字（姓+单名）→ 姓 + "某"（如 张煊→张某）
 *           ⚠️ 不存储报名手机号（已剔除）
 * 字段说明：
 *   subject   科目（数学 / 后期可扩展 物理 等）
 *   teacher   老师（内部标签，渲染时不对外暴露机构/老师名）
 *   base      基地（成都 / 合肥 / 西安 / 空=未标注）
 *   planner   规划师（内部用）
 *   province  考生省份
 *   student   匿名考生姓名（姓+某+末字 / 姓+某）
 *   from      起始分（尽力解析，模糊填 null）
 *   to        高考/最终分（尽力解析，模糊填 null）
 *   gain      提分（数值或区间字符串，模糊填 null）
 *   note      亮点短语（从原始描述提取）
 *   raw       原始文字描述
 * 扩展方式：后期新增案例直接往 window.CASE_LIB.push({...}) 追加即可。
 * ========================================================================= */
window.CASE_LIB = [
  { subject:"数学", teacher:"胡源", base:"成都", planner:"张诗曼", province:"黑龙江", student:"马某笛", from:30, to:90, gain:60, note:"数学从30到90，进步60分", raw:"数学从30到90进步60分" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"张瑶", province:"江苏", student:"王某卿", from:20, to:107, gain:80, note:"基础20多分，高考107，提分80+", raw:"基础20多分，高考107，提分80+" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"王琬茗", province:"重庆", student:"张某越", from:80, to:112, gain:32, note:"最开始80分到高考112", raw:"最开始80分到高考112" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"谢东平", province:"广东", student:"温某辉", from:67, to:104, gain:37, note:"报名67分，高考104分，进步37分", raw:"报名67分，高考104分进步37分" },
  { subject:"数学", teacher:"胡源", base:"", planner:"谢东平", province:"浙江", student:"祁某立", from:70, to:107, gain:37, note:"模考70分，高考107", raw:"模考70分，高考107" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"黄小玲", province:"黑龙江", student:"郝某良", from:20, to:null, gain:60, note:"进班20分，提分60分", raw:"进班20分，提分60分" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"黄小玲", province:"湖南", student:"张某", from:50, to:106, gain:56, note:"进班50分，高考106分", raw:"数学进班的50分，高考106分" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"陈秀娟", province:"河南", student:"李某嘉", from:50, to:79, gain:29, note:"一直50分，高考79分，提分29分", raw:"数学一直50分，高考79分，提分29分" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"赵海君", province:"福建", student:"纪某琳", from:80, to:null, gain:null, note:"5月份进班，进班80分", raw:"数学620分，5月份进班，进班80分" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"刘尧曌", province:"陕西", student:"卢某婷", from:80, to:130, gain:50, note:"从80分到高考130，提分50分，总分657", raw:"进班一年半，从最开始80分到高考130，提分50分，总分657" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"陈秀娟", province:"广东", student:"刘某泽", from:30, to:72, gain:42, note:"从30分到高考72分，提分42分", raw:"进班一年半，数学从刚开始30分到高考72分，提分42分" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"任汇鑫", province:"贵州", student:"方某", from:90, to:123, gain:33, note:"从90提升到123分，进步33分，总分631", raw:"近班半年，成绩从90提升到123分，进步33分，总分631" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"任汇鑫", province:"重庆", student:"张某禹", from:80, to:111, gain:30, note:"从80分提升到111分，进步30分", raw:"进班半年，成绩从80分提升到111分，进步30分" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"韩博", province:"广西", student:"王某雅", from:9, to:55, gain:50, note:"个位数到高考五十几，圆梦本科", raw:"最后一个月进步50+，数学个位数到高考五十几，圆梦本科" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"段丽", province:"山东", student:"许某涵", from:90, to:105, gain:15, note:"平时90左右，高考数学105", raw:"平时成绩一直在90左右徘徊，高考数学105" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"王锋", province:"陕西", student:"王某辰", from:55, to:92, gain:37, note:"之前五六十分，高考考了92分", raw:"之前数学只能考到五六十分，高考考了92分" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"朱国韬", province:"福建", student:"孔某晖", from:85, to:116, gain:31, note:"入学80多分到116分逆袭", raw:"入学80多分到116分的逆袭" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"王锋", province:"吉林", student:"陈某然", from:75, to:119, gain:44, note:"平时7-80分，高考最好119", raw:"平时7-80分高考考的最好119，高中最好的一次" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"胡俊", province:"山东", student:"李某翔", from:65, to:101, gain:36, note:"进班六七十，高考101最高的一次", raw:"高二下进班六七十，一模40分，高考101最高的一次" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"段丽", province:"浙江", student:"林某翔", from:100, to:122, gain:22, note:"平时100分，高考超常122分", raw:"平时100分。高考发挥超常，122分" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"蒋雨柔", province:"山东", student:"李某迎", from:80, to:104, gain:24, note:"平时80多甚至70多，高考104", raw:"平时80多分，甚至70多分，高考数学考104" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"叶康顺", province:"内蒙古", student:"左某轩", from:65, to:110, gain:45, note:"进班六七十，高考110最高", raw:"高二下进班六七十，高考110最高的一次" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"段丽", province:"福建", student:"郑某楠", from:null, to:null, gain:25, note:"数学进步25+，三年来最高分", raw:"数学进步25+ 数学三年来最高分，总分比起模考进步40多分" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"王薛", province:"吉林", student:"贾某悦", from:85, to:null, gain:30, note:"三年最高分，之前80+90+，进步30+", raw:"数学三年最高分，之前一直80+，90+，至少进步了30+" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"王薛", province:"湖北", student:"罗某丹", from:70, to:null, gain:20, note:"三年最高分，之前70+，进步20+", raw:"数学三年最高分，之前一直70+，至少进步了20+" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"闵悦", province:"山西", student:"穆某雯", from:null, to:null, gain:70, note:"高考最高分，提分70+", raw:"高考考了最高分，提分70+" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"闵悦", province:"广东", student:"冯某斐", from:70, to:105, gain:35, note:"从70分提升至105分", raw:"从70分提升至105分" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"殷金浩", province:"山西", student:"任某璇", from:65, to:114, gain:49, note:"从及格徘徊到高考114分", raw:"从及格徘徊到高考114分，非常满意" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"胡俊", province:"山西", student:"武某璇", from:60, to:90, gain:30, note:"进班60分，高考拿下90", raw:"高二进班只有60分，高考拿下90~" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"王薛", province:"江西", student:"周某瑞", from:90, to:115, gain:25, note:"80~100波动，高考115突破上限", raw:"数学一直80~100波动，这次高考直接115突破上限" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"王羽林", province:"陕西", student:"刘某怡", from:95, to:null, gain:20, note:"90-100徘徊，高考提分20+", raw:"数学一直在90-100徘徊，高考提分20+" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"管近宇", province:"安徽", student:"张某瑞", from:null, to:null, gain:null, note:"可以上自己理想的学校", raw:"可以上自己理想的学校" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"史俊可", province:"新疆", student:"张某予", from:null, to:null, gain:70, note:"预估2本线，放榜1本超出70分", raw:"新疆考生 本来预估分数在2本线左右，现在放榜在1本超出70分" },
  { subject:"数学", teacher:"胡源", base:"", planner:"张旭", province:"云南", student:"甘某博", from:null, to:null, gain:null, note:"超常发挥，之前很难上本科线", raw:"云南省考生 跟着胡源老师学，超常发挥 之前很难上本科线" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"程昌彦", province:"山东", student:"琳某", from:null, to:null, gain:null, note:"数学高考考了高中生涯最高分", raw:"数学高考考了高中生涯最高分" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"廖青华", province:"广东", student:"刘某莹", from:null, to:null, gain:48, note:"复读跟读1年，总分提升48分，数理化进步", raw:"复读生，2025年9月7日报课，跟读1年，总分比去年提升48分，在读的数学物理都进步" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"侯伟", province:"辽宁", student:"闵某", from:460, to:531, gain:71, note:"进班总分460，高考531，总分提高71分", raw:"进班总分460，高考总分531，总分提高71分" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"韩博", province:"安徽", student:"栾某强", from:null, to:115, gain:56, note:"数学115，比二模进步56分", raw:"数学115，总分626，比二模时候进步了56分，数学" },
  { subject:"数学", teacher:"胡源", base:"成都", planner:"韩博", province:"黑龙江", student:"薄某元", from:null, to:null, gain:100, note:"三年最高分，总分比模考进步一百多分", raw:"数学三年来最高分，总分比起模考进步一百多分" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"王薛", province:"宁夏", student:"孙某勇", from:null, to:null, gain:null, note:"三年最高分，圆梦梦想大学", raw:"数学三年最高分，看到分数开心哭了，终于碰到梦想大学" },
  { subject:"数学", teacher:"胡源", base:"合肥", planner:"王薛", province:"辽宁", student:"李某菲", from:null, to:null, gain:null, note:"可以上自己的梦想大学", raw:"可以上自己的梦想大学啦" },
];

/* 按省份+科目+成绩同水平筛选真实提分案例
 *   province: 当前考生省份
 *   subject : 科目（默认数学）
 *   score   : 考生该科填写成绩（用于 ±10 同水平匹配，不按满分制分层、不换算）
 *   maxN    : 最多返回条数（默认 2）
 * 优先级：① 同省 + 同水平(±10)  ② 外省 + 同水平(±10)  ③ 均无则不代入
 * 返回文本含【师:姓名】标记，渲染时转为"XX老师的学生"（页面显示，PDF/长图导出自动隐藏）
 */
window.getCaseBrief = function(province, subject, score, maxN) {
  subject = subject || '数学';
  maxN = maxN || 2;
  var lib = window.CASE_LIB || [];
  var s = (score === 0 || score) ? Number(score) : null;
  function inBand(c){ return c.from != null && s != null && Math.abs(Number(c.from) - s) <= 10; }
  var same = lib.filter(function(c){ return c.subject === subject && c.province === province && inBand(c); });
  var other = lib.filter(function(c){ return c.subject === subject && c.province !== province && inBand(c); });
  var picked = same.concat(other).slice(0, maxN);
  if (picked.length === 0) return '';
  var lines = picked.map(function(c){
    var teacherPart = c.teacher ? '（【师:' + c.teacher + '】的学生）' : '';
    var fromTxt = (c.from != null) ? (Number(c.from) + '分') : '';
    var toTxt = (c.to != null) ? ('到' + Number(c.to) + '分') : '';
    var gainTxt = (c.gain != null) ? ('提分' + c.gain + '分') : (c.raw || c.note || '进步明显');
    return '- 咱们' + (c.province || '该') + '省学员' + (c.student || '') + teacherPart + '，' + subject + '从' + fromTxt + toTxt + '，' + gainTxt;
  });
  return lines.join('\n');
};
