# Pad 横屏界面本地改造

## 范围与身份

- 直接基于 `Daydreamcgy/huawei-music-win`，基线提交 `84a34f50fc5649af5ed425ac3694190a7b14da98`，工作分支 `feature/pad-ui`。
- 以用户提供的五张 Pad 横屏截图作为一级页面视觉参照，不再沿用上游侧栏和底部通栏播放器。
- 保留上游 Electron / React / TypeScript、账号业务与应用标识；初轮只改界面，后续为真实更新、音质证据与模式持久化扩展 main / preload / shared。扩展保持窄白名单 IPC，不允许 renderer 提供更新 URL、安装器路径或凭据。
- 保留 `huawei-music-desktop`、`org.hwmusicdesktop.unofficial` 与非官方产品名。独立派生发行源为用户授权的 `wzz19931003/huawei-music-pad-unofficial`，不是华为或上游作者的官方发行。
- 界面复刻、离线交互验证、真实华为服务验证分别验收。当前不能声称“功能完全复刻”。

## 已实现界面

| 页面 | 本地实现 | 服务边界 |
|---|---|---|
| 首页 | 四张大圆角卡片、最近播放与收藏歌曲、三列歌曲列表 | 数据来自上游账号 API；未登录时为空状态，不填充假账号曲库 |
| 音乐厅 | 双横幅、分类胶囊、常听歌手、歌单、收藏精选 | 歌手搜索、个人歌单和收藏复用上游；每日推荐、排行榜等明确未接入 |
| 现在就听 | 左侧完整封面构图、右侧歌词和歌曲信息、收藏、播放/暂停、切歌、模式、进度、音量、队列 | 复用单一 Audio 与上游播放解析；空间音频未接入 |
| café听 | 竹林氛围横幅、听书分类与有声内容区 | 听书、播客均标明未接入，不提供假的音频结果 |
| 我的 | 账号区域、收藏/歌单/历史统计、歌单分类、设置入口 | 统计取真实已加载服务结果；未登录不显示旧账号内容或假会员 |

底部为左侧五项悬浮导航与右侧独立迷你播放器；播放页导航居中。原收藏、歌单详情、搜索、历史、设置和队列继续作为二级界面使用。用户尚未提供这些二级页面的 Pad 参照，不能称其逐像素还原。

## 后续改进与验证入口

`0.2.0` 接入自绘图标库、四选一播放模式、独立音量、真实格式证据与三处原生更新入口。`tools/test-pad-modes.mjs`、`tools/test-pad-quality.mjs`、`tools/test-pad-update-ui.mjs` 分别检查模式 / 持久化、音质 DTO 显示和更新恢复；均使用明确的离线夹具，支持 `PAD_QA_EXECUTABLE` 指定真正的已打包 EXE，记录实际版本、清理与通过断言，不伪造旧版本。

音质开发态探测需显式设置 `PAD_QA_ALLOW_DEVELOPMENT=1`；打包态不需要该开关。在线更新另用 `tools/test-update-live.mjs`，清除 GitHub 凭据环境变量、隔离用户目录和更新缓存，比较真实较旧 EXE 下载的目标安装包字节，不执行安装器。

更新的旧 `0.1.0` 首次引导要求、收藏扫描预算和各项未验边界见 README 与实现进度。最终验收附件独立记录打包与发布后的在线结果，不能把代码冻结文档的待验项当作成功。

## 本地运行

使用仓库锁定依赖，执行：

```powershell
npm ci
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm start
```

构建与检查：

```powershell
npm test
npm run test:unit
npm run typecheck
npm run test:pad-ui
npm run dist:win
```

`npm test` 负责 `node:test` 协议/业务与导航测试。`test:unit` 只收集 `src/renderer` 下的 Vitest 测试，避免把 `node:test` 文件误交给 Vitest 后报 `No test suite found`。没有删掉或跳过 Node 测试。

## 离线 Electron 验证

维护的探测脚本是 `tools/test-pad-ui.mjs`，测试夹具在 `tools/pad-qa-fixtures.mjs`。它们不被产品代码导入，不进入应用运行时。

- 启动仓库的实际 Electron 或指定的已打包 EXE，使用 scratch 下的独立 profile，并读回 `app.getPath('userData')` 确认隔离。
- 只在测试进程替换明确的业务 IPC handler，注入合成账号、测试歌单、测试歌词、本地静音 WAV；不使用真实凭据或华为音源。
- 通过可见控件检查五项导航、未登录空状态、登录入口错误反馈、播放/暂停、切页不停播、键盘与指针 seek、收藏增删及状态同步、队列、搜索防抖取消、收藏/歌单/历史二级页、真实本地设置持久化。
- 在 1560×1040、1320×840、960×640、1920×1080 四种原生逻辑视口检查导航/播放控件的可见性、边界与中心命中；1560 和 960 宽度各保存五页截图。
- 等待播放页动画结束后截图；检查全屏层没有继承上游 `section` 外边距，封面不横向放大裁掉主体。
- 结束时关闭进程、移除 profile 并检查清理结果。

默认输出在 `release/qa/pad/`。已打包应用可用以下方式重复同一离线探测：

```powershell
$env:PAD_QA_EXECUTABLE = (Resolve-Path 'release/win-x64/win-unpacked/华为音乐（非官方）.exe').Path
node tools/test-pad-ui.mjs
Remove-Item Env:PAD_QA_EXECUTABLE
```

打包探测输出在 `release/qa/pad-packaged/`。这不是安装/卸载验收，也不是华为登录、会员、CDN 或真实音质验收。

可选 `PAD_QA_REFERENCE_ART` 指向仅测试使用的 WebP data-URI JSON 数组，用用户截图中的封面裁图做视觉比较。不设置该变量时使用明确的生成测试封面。该 JSON 不随应用分发。

## 素材来源

`src/renderer/assets/pad-cafe-atmosphere.webp`：

- 公开候选已换为 `scripts/generate-pad-cafe-art.py` 程序化生成的竹影装饰图，无外部图片输入。
- 初轮本地参考的截图裁图已从当前运行素材移除，不随公开源码或二进制分发。
- 测试可选封面裁图仅来自外置 QA 文件；生产与默认测试均不依赖该文件。
- 原创生成脚本与输出一并提供；代码许可不代表获得远端音乐、商标或参考截图授权。见 `NOTICE`。

## 验证边界与剩余项

- 新的 Pad 离线探测不能取代上游旧界面脚本。旧 `test:electron-ui` 在修改前已因页面文案/结构失配失败；仍保留该结果，不宣称所有旧 Electron 套件通过。
- 真实华为账号登录、账号切换/会话恢复、真实音乐连续播放、会员权益及音质：本轮未实测。
- 每日推荐、榜单、听书、播客、空间音频：未接入；下载/解密/绕过会员不在范围内。
- Windows 安装、升级、卸载、快捷方式、实体媒体键与长时间/睡眠恢复：与构建和已打包 EXE 的离线启动检查分开验收。
- 构建未签名，构建命令本身不发布或自动安装；发布仅到用户授权的独立仓库。版本号与对应源码 / 更新元数据一一绑定，不表示上游同名发行附件。
