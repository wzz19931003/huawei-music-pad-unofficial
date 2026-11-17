// Single source of truth for the user-visible product name.
// The technical app name (package.json "name") stays unchanged so existing user data
// directories and settings keep working after the rename.
//
// 显示名必须始终带「非官方」：这是本项目唯一能自证身份的地方（窗口标题、托盘提示）。
// Wmusic 是本项目的独立显示品牌，不表示华为官方身份或授权。
export const APP_DISPLAY_NAME = 'Wmusic（非官方）';
export const APP_BRAND_LABEL = 'Wmusic · 非官方';
