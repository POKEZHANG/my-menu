// 数据源开关。
//   "local" —— 读同目录的 dishes.json，纯静态，不连任何服务器（默认）
//   "cloud" —— 读 Supabase 里的 dishes 表
// 网页端两个都只读；写入方式见 README「三、加菜」。
window.APP_CONFIG = {
  DATA_SOURCE: "local",

  SUPABASE_URL: "https://zawwbsqxwtkrwhcbxedl.supabase.co",
  // Supabase 的 Publishable key（sb_publishable_...），可公开，等同于旧版 anon key。
  SUPABASE_ANON_KEY: "sb_publishable_6Hgys9ENsf8ZO90bQWsEng_uf0DuxZ2",
};
