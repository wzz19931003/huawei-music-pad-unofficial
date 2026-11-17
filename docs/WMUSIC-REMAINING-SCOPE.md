# Wmusic 剩余任务执行记录

## 发布整合阶段的当前边界

用户后续明确要求完成发布，开启2026-11-17的新阶段；旧单项“不得native/发布”是当时范围，不回改历史，也不扩权为读取私密账号、真实安装、改注册表、自动重启或OAuth扩scope。发布目标仍仅为已授权的独立仓库。

已交回并停写：心动4源（36 Node/22 hook，限定独审通过）和热门榜单16源（87 focused Node/101 focused renderer、类型与捕获响应重放通过）。首页“继续播放”是无法安全映射MusicFM时的已授权后备；公开榜单4次真实匿名读取成功，目录/详情数量分层。官方每日/新发行的400及2023字段失败/限制保留，不以假条目填充。心动“圈外”仅针对最多24个所选种子，不承诺全库新颖性。

安全依赖候选45.3.3/6.8.12已实际通过原字节64门禁，并经两manifest/candidate-deps独审；Node24.22.3/builtinUndici7.30.2是实际进程观测。minimatch六份未修，固定受信构建、实际生产closure/ASAR排除和输入路径独审支持当前Windows build-only残余披露，不是消除漏洞、所有平台修复或audit清零。

发行验收必须继续区分：最终源全量/类型、单写者构建、包/source字节绑定、实际包运行、发布资产读回；真实账号/会员/CDN、物理拖动/托盘/媒体键、volume0后台、安装/重启/迁移/卸载和整体视觉批准仍各自独立。以同版本Release验收附件的真实命令、退出码和哈希为准，不让旧品牌包或中间trial的5项心动失败快照替代最终源。

**下文按阶段保留历史。旧“最新/待回/未授权”等措辞只描述当时状态，不构成本阶段的任务队列或当前授权。**

记录日期：2026-11-17（本地时间；本轮实现跨午夜）。基线为本会话已验证的本地 0.2.1 品牌候选；其冻结源码、安装器和证据目录不覆盖。

## 用户本轮明确确认

1. 桌面歌词：选择「按这套完整浮窗方案做」——普通透明置顶窗口、双行、可拖动、字号/颜色调节、锁定后鼠标穿透、托盘解锁、记住位置；翻译与逐词仅使用歌词源实际提供的数据，不做 Windows 桌面注入。
2. 打赏：选择「两张收款码可随安装包和公开源码分发」。文案为「请维护者喝杯咖啡」，明确完全自愿、不影响任何功能。用户随后已在聊天提供微信与支付宝两张真实图片；不代造收款码、不把单元测试图片作为生产收款码、不自动支付。
3. 头像：选择「允许，届时由我在官方页面登录或授权」。可在接入后做一次头像/昵称只读验证；用户在官方页面操作，不在聊天接收密码、不直接检查已有私有配置、不输出令牌。此授权不证明现有协议或 scope 已支持头像。

## 已开始的独立实现流

- 桌面交互：固定左导航、常驻底部播放条；保留单一 Audio、现有业务和居中 Wmusic 品牌。播放模式放在下一首右侧；修正小控件轮廓/线宽/镂空/选中态，保留观察与原创补全的区别，不宣称逐像素已获批准。
- 首页：按「现在就听、每日30首、新歌推荐、心动模式、我的收藏」排序，删除最近收藏。结构调整不能冒充官方 FM、每日推荐或新发行接口已经接通。
- 更新内容：从真实 updater 候选信息归一化、限长并按版本传到界面；安全纯文本显示，不渲染任意 HTML，不丢失已下载/重试状态。
- 歌词子系统：独立受限 preload 与本地浮窗，只镜像主播放器的实际时钟与有限当前/下一歌词行；不得创建第二个 Audio、扩展为通用 IPC 或把账号/音源 URL 交给歌词窗口。
- 只读协议研究：枚举截图真实模块，核对可验证的云端来源、头像字段/授权/CDN与现有接口缺口；不读取真实账号配置、不调用带用户认证的服务。

## 父任务已完成的局部准备

- 主播放器新增只读 `readClock()`，直接读取现有 Audio 的时刻、暂停/就绪状态和速率，不返回媒体 URL 或凭据。后续发现解析下一首期间旧 Audio 仍可播放，因此代次改为实际赋给该 Audio 源的真实 loadToken，并增加只读 `trackId` 供发布器在本进程匹配；清空源时保留已提交代次、清空身份。没有暂停旧曲或改变现有解析/播放行为。针对首次等待、等待下一首、清空后再播放的回归经历 RED→GREEN，相关 hook 17 项通过；真实原生 Audio 到浮窗的自动发布仍待最终桥接验收。
- 打赏面板实现微信/支付宝切换、自愿说明、键盘切换与错误状态；已将用户提供的两张图片裁切为带白色静区的本地 PNG，去除原始元数据，未生成、重绘或更换收款信息。原图、裁切后 PNG 与 300px 显示尺寸均离线解码且内容哈希一致；真实资产绑定组件测试 3/3、素材完整性 Node 测试 1/1 通过。证据为 `build/donation-assets.json`。生产源码已接入「我的 → 请维护者喝杯咖啡」，无需登录，可切换微信/支付宝，支持键盘、图片错误提示和切换恢复、返回我的。实际渲染器与现有 preload 在隔离离线 Electron fixture 主机的 5 项检查通过：960×640、1320×840、当前宿主 150% DPI 下，两种实际渲染截图都能解码为原始收款信息；未改写二维码，必要时以 1:1 物理像素显示，避免分数缩放导致的校验失败。最终本轮证据目录为 scratch 下 `wmusic-donation-evidence-Ohq9p3`（进程和测试 profile 均已清理）。这不是打包客户端或真实支付验收；未验证实际支付、到账或收款人身份，也未打开收款地址。

## 三项内容语义已确认（方案，不是实现或真实服务验收）

用户已直接在聊天回答：①现在就听优先官方 Music FM，做不了才续播；②心动不能局限收藏歌手/专辑，要适当拓展其他歌手/专辑；③未接通功能尽量接官方，实在接不了再暂时留空。原话及优先/后备约束写入 `design-previews/wmusic-round3/confirmation/decisions.json`，3项均answered；此前表单超时/未提交历史不回改，也不强塞为旧互斥选项。当前仍implementation/official verification pending，不能拿未尝试当不可行、以留空算完成，或将历史/收藏切片、搜索排序、本机标签/本地算法冒充官方推荐、云端关注、排行榜或发行时间。

## 歌词跨层接线检查点（尚非最终候选）

以下按实施先后保留失败与局部检查点；其中的「当前/待回」属于各自阶段，最新口径以本文「最新歌词源码与离线原生检查点」为准，不删除或倒改旧失败证据。

- 已接入主 preload 的窄 `desktop.desktopLyrics` 能力及主进程唯一 controller；独立浮窗使用 `desktopLyrics`，没有完整业务 API。双 preload 各自生成独立 CJS，不依赖相对公共 chunk；renderer 有两个明确 HTML 入口。
- 实际尝试 electron-vite 5.0.0 的 `isolatedEntries` 后，非 TTY 构建因其未保护的 stdout 光标方法失败。保留失败，不修改依赖源码、不伪造 TTY；改用主 preload 单入口构建，加 `scripts/build-lyrics-preload.mjs` 单独生成浮窗 preload。已执行真实构建和独立产物 require 检查；这不是升级 electron-vite 或安全依赖修复。
- `desktop-lyrics.json` 仅保存经过归一化的字号、颜色、开关及位置等非秘密字段；限定大小与版本、独立原子替换，读取/写入错误不伪装成保存成功。没有复用凭据、队列或旧 settings 文件。
- 托盘已接显示/隐藏及解锁；主窗口创建/重建会绑定 controller。默认关闭主窗口会真实退出，即使浮窗仍可见；退出等待受限 dispose，避免遗留歌词窗。父级实际编译主程序通过隔离启动器运行的 3 项探测已通过，证据为 scratch 下 `wmusic-lyrics-integration-mByY9Y/evidence/evidence.json`，profile/runtime/进程已清理。该检查是主程序/IPC/浮窗/退出链路，**不是单一真实 Audio 同步、物理托盘操作、打包或安装验收**。
- 增强原生 DTO 验收已回收，父级机械复核 **11 项全部执行通过**、错误列表为空、两个自然退出的进程及其跟踪子进程/窗口均清理、profile/runtime 删除；6 张截图文件的字节数和哈希均匹配，且实看两张浮窗截图的两行文字/高亮、字号颜色及控件未见明显裁切。真实 Win32 穿透位由锁定 true 变为托盘实际 `MenuItem.click` 回调后的 false；**不是物理任务栏点击，也不是物理鼠标拖动**。实际退出后以同一隔离 profile 启动第二进程恢复字号/颜色/原生位置；重载 epoch 3→4、generation/sequence 0/0 接受、旧 epoch 拒绝。证据为 scratch 下 `wmusic-lyrics-integration-yauFHB/evidence/evidence.json`，工具源码 SHA 与报告绑定，14 个 out 文件与前后清单及当前旧产物完全一致。父级另复制并读回验证旧编译检查点到 `wmusic-lyrics-native-dto-baseline-Pn9upa`，明确 **先于自动发布器主 UI 接线与 B1 修复、Electron 44.7.2 的 DTO/native 检查点，不是当前源码/最终包认证**。该通过不消除 B1，不升级为真实 Audio/官方服务/安装/用户视觉批准。
- 主播放条「词」按钮、原生状态控制器及异常/清理已源码接线：显示实际 shown/locked，重复操作合并，保存失败后读回实际窗口状态，同一持久化错误不随时钟广播重复弹出，迟到旧状态不倒退较新的事件。没有增加 Audio 或媒体接口。其组件/控制行为已做单元检查，主 UI 与自动歌词发布的最终原生联合验收尚未完成。
- 发布器两文件已回收，父级已接入 App：effect 只连接一次，读取最新 `playerRef.current`，曲目/歌词/播放/缓冲变化即时 pulse，组件/文档清理停止心跳并注销监听；时钟仍由现有 Audio 直接读取，heartbeat 为 200ms。导出为 `connectDesktopLyricsPublisher({api,getPlayer,onState?,onNotice?}) → {pulse,stop}`，只有本进程匹配使用真实 trackId，发送 key 为 `g:<已提交代次>`；不发送服务 ID、URL、账号、整个曲目/歌词对象。子任务 48 项已交回；父级独立重跑发布器/控制器/按钮/实际时钟 hook 共 70 项、静态 App 接线 2 项、typecheck/diff 均退出 0。静态接线不是原生自动同步通过。
- 独立对抗审查回收 **B1 中等生命周期问题**：原 `src/main/desktop-lyrics.ts` 已保存 visible=true 启动恢复在等待 load 后无条件 show，可覆盖较新 Hide、以及 before-quit 后仍调用 show。第三修复上下文已仅修改该启动区块，补 `!disposed && !quitting && preferences.visible && !window.isDestroyed()` 后再显示；两个实际 controller 回归分别经历 Hide RED→GREEN、before-quit RED→GREEN，没有改旧 mock 或削弱断言。父级读回 diff、验证 controller/test 的 c3df4a…/9ac722… SHA 并独立运行 controller/preload/overlay 18 项、Node policy/model 10 项、typecheck 均通过。原报告和新修复日志分别在 scratch 下 `desktop-lyrics-adversarial-audit` / `desktop-lyrics-b1-fix`。**B1 启动区块修复已通过独立限定复审**：第四个独立只读上下文重新执行 controller 14 项、3 项 scratch 补充 probe 均通过，并将原 controller 仅在内存替换时复现两条预期 RED；父级已读回三份 JSON、机械核对 14/0、3/0、0/2（旧源预期失败）以及当前两文件 SHA。结论无 security_concerns/logic_errors；报告 `hermes-verify-b1-independent-rereview-c3df4a50503d.json` 仅认证这两文件、这个 startup-only diff，不是最新全树、原生 OS、publisher/Audio、包体或全应用安全批准。普通保存可见恢复、销毁窗口拒绝和 Hide 后较新 Show 为 scratch probe；建议保留前两项至维护测试是非阻塞建议，未因此重改已绑定文件。getter/序列化的直接 helper 行为仍是有界提示，未建立 Electron 可利用链，不升级为漏洞事实。
- 新增明确维护入口 `npm run test:desktop-lyrics`，先实际记录 missing-script RED，再接入 Node 策略/模型/存储/构建/静态接线和 main/preload/renderer/publisher/player 的完整聚焦集合；该精确入口已运行：Node 15 项、Vitest 8 文件/88 项、typecheck/diff 退出 0。原 `test:unit` 仍是 renderer 范围，不把新 main/preload 回归暗算进渲染测试数量；入口本身不启动 Electron、不认证原生或服务。
- 新增维护工具 `tools/test-wmusic-lyrics-playback.mjs`，先对旧共享 out 建立真实 integration RED：主播放条「显示桌面歌词」按钮为 0，未用 IPC/托盘替代，也未手工 publish；旧产物字节未变且进程/profile/runtime 清理。证据为 scratch 下 `wmusic-lyrics-playback-XguGTv/evidence/evidence.json`，后九项未执行，不算通过。
- 旧探测任务交回并释放 out 后，父级已执行规范 `npm run build`，然后真实运行实际 main/preload/renderer、现有单 Audio、自动 publisher 到 native overlay。首轮编译检查点清单 SHA 为 `72364170ea440fa2f709dc3a79056ccdee3083538d94e54677601bbf6634e365`；父级机械核对 14 个产物字节与探测前后清单一致。该轮探测 **7 项通过、1 项失败、3 项未执行，整体 accepted=false**，证据为 `wmusic-lyrics-playback-6ifxsF/evidence/evidence.json`，清理均通过。实际已覆盖按钮开/关、收藏播放触发原生 metadata/playing、暂停与键盘向后 seek、源 current/next/翻译/逐词、等待 Next 时旧 Audio/标题/歌词/代次保留及新源提交、真实 native ended 自动换曲、主窗隐藏/最小化而浮窗可见的采样与三行进展。没有第二 Audio，没有手工歌词 DTO 充当整链证据。
- 后台观测先发现 QA 自身的会话问题：新建 sibling CDP session 关闭 focus emulation 不能移除 Playwright 原 owner 的可见性覆盖。用最小原生探测验证后，改为检查已安装 SDK 的原 exact-primary session，记录 1.64.0 与源码哈希，结构变化则失败，不修改依赖源码。最终隐藏/最小化均真实 `document.visibilityState=hidden`、有效 backgroundThrottling=true，各观察到 8 个不同接收锚点与 3 行源歌词；间隔中只读可见浮窗，不执行主窗 JS、不注入 clock tick、不改生产调度参数。
- **保留失败的静音变体**：原 observer 强制 `Audio.muted=true`，真实隐藏后 Audio 立即被 native pause，证据为 `wmusic-lyrics-playback-PFNser`（失败 JSON 和精确工具字节保留）。独立最小原生实验 `hermes-verify-media-visibility-pU8zWE` 证明 DOM/原生输入下强制 muted 都暂停，而未强制 muted 的全零 PCM WAV 继续走时；两种情况不能混称。当前七项通过使用本来就无声的全零 PCM、保留原生 constructor mute 默认状态，**不认证 force-muted 后台继续播放；实际用户音量为零时的后台行为尚未测**。未降低 1500ms 新鲜度或 44px 几何阈值来放行，也未靠禁用生产后台节流掩盖失败。
- 联合探测曾在 960×640/1320×840 的 mini/full 四组几何中拒绝 mute 30×30；`desktop.css` 补用既有 44px hit token 后，连同回收的当前/已播 removeAt 两行接线、App 空队列保存 effect 重新规范构建。父级核对 QueuePanel/source-test 的 `42a9af…`/`7e2ae3…` SHA。最新实际探测 **9 项通过、1 项 reload 失败、1 项 quit 未执行，整体 accepted=false**，证据 `wmusic-lyrics-playback-Xqdqks/evidence/evidence.json`；四组 44px/viewport/独立 slider、实际逐行移除至 Audio 停止及浮窗清空、实际 App 发送空队列保存请求均通过。不是磁盘/跨进程保存或安装验收。14 个编译产物清单 SHA `ed9acf9051a28810cbe2b528257b3db70c389dd702361c7a762ac7bf8ae0f8f5` 与前后清单和当前 out 匹配；进程/窗口/profile/runtime 已清理。另在 `wmusic-lyrics-reload-red-baseline-yoioNg` 保留 14 产物、精确失败工具/报告、紧回路工具的 17 个受绑定条目及单独 manifest；不是依赖齐备的独立程序/安装包，截图留在原证据目录。
- **新发现的 reload epoch 竞态仍为阻塞**：播放时 epoch4/gen7；导航开始 reset 到 epoch5 后，旧文档尚存活并经自动发布器恢复 epoch5，旧 gen7/seq0 被接收；新文档加载后真实空 Audio 的 gen0/seq0…51 全被 STALE 拒绝。已从报告的原生加载时刻和自动 publish 记录对齐，不将此误诊为事件签名迁移：空文档重载诊断 `yfEFdE` 实际捕获六个参数，现代 details 与 legacy mainFrame/inPlace 均有效。新增 `--epoch-only` 为明确的**播放中重载紧回路，而非 11 项整组**，旧 out 再现同类阻塞（`tPHCYw`，无 RateLimited 干扰）；原始短回路曾因叠加 primary state 轮询触发频率限制，已改读真实 overlay 窄 state，而没有放宽生产限制。已交独立两文件上下文仅修文档提交边界/epoch、保留 B1 startup/trust/单调 generation，未回收；重建/原生复验与针对新 diff 的独立审查仍待。
- 队列审查另指出的两个 App 数据时序问题已各自先 RED 后最小修补：用户移除最后一项后，迟到初始恢复不得重新放回旧队列；明确清空后的更新安装 preflight 必须等待 `saveQueue([], -1, 0)` 成功并取消旧 debounce，保存失败保留 downloaded 候选且不 install。既有「曾有非空队列」ref 复用于判定显式清空，初始未触碰空态不能删旧存档，普通非空保存/恢复仍保留。精确执行真实 App effect/回调源码的 **10 项 Node** 与 **18 文件/197 项 renderer** 通过；这不是 React 全应用、真实磁盘或安装测试。五文件 SHA 输入为 `wmusic-queue-lifecycle-review-input.json`，独立限定只读审查已派出未回收；本轮冻结这五文件，主进程 reload 修复属于另一个受限写入流。
- 此前源码检查点：`npm test` 302/302、`npm run test:unit` 18 文件/187 项、`npm run typecheck`、`git diff --check` 均退出 0；独立歌词边界 Node 14 项、preload 2 项通过。日志在 scratch 下 `wmusic-lyrics-checkpoint-c45b2fc5e8`。diff 命令仍提示已有 `src/main/icons.ts` 的 LF/CRLF 提示，不隐去该提示。并行发布器/原生验收尚未收束，故这些数值是检查点，不是冻结认证。
- 历史增强 DTO 原生验收期间曾冻结共享 out、不允许重建；该任务已交回并保留独立旧产物。现共享 out 的 ed9acf… 检查点包含主 UI 自动发布器、B1、mute 几何、空队列保存和当前/已播移除，但早于最新 App 恢复/安装 preflight 两个 guard 与尚在独立修复的 reload epoch。汇总后必须重新构建复验；不能把 9 项部分结果或旧 DTO 11 项扩大成最新全组、包体、安装或安全通过。B1 的旧两文件哈希审查仍仅是当时 startup-only 范围证据，不为随后新的 controller diff 背书。

## 最新歌词源码与离线原生检查点（未打包）

- reload 修复已交回，生产只插入 3 行：主窗口 `did-finish-load` 再执行既有 reset，并在替换/销毁时移除该 listener。真实 controller 主回归先 `STALE` RED 后 GREEN，共新增 4 个维护用例（含该主回归）覆盖生命周期边界，原 B1 startup 区块、旧测试/mock 字节保留。父级读回 report/patch、验证 source `341ba401…`、test `699dabec…` 与 patch `23372d59…`；证据 `hermes-verify-lyrics-reload-4j7t4rrt`。未迁移无关事件参数、未接受同 epoch 代次倒退、未改 trust/存储/协议。
- 父级重新执行 **`npm run build` 退出 0**，当前 14 个编译产物清单 SHA 为 `cc24c7a81b8f0d78613b5f5174706c720cb3b9ffcc21f9009f73c3a0a73d9ccf`。同一产物上的播放重载紧回路 `--epoch-only` **1/1 通过**（`wmusic-lyrics-playback-Af8oqe`），随后默认 **真实单 Audio/自动发布/原生浮窗整组 11/11 通过**（`wmusic-lyrics-playback-J5XDGH`）。该紧回路不另冒充全组。
- 整组覆盖开/关按钮、真实 metadata/playing、暂停/回退/源词、等待 Next 的旧源保留与提交切换、真实 native ended、隐藏/最小化源时钟与行进展、四组 44px 几何、实际队列移除/Audio 停止/歌词清空及空保存请求、真新文档重载/epoch 6→8/新 Blob 与重新播放、主 API 退出/原生窗口清理。父级机械核对 11 个计划/步骤/通过、0 未执行、0 renderer 异常、14 个产物和 16 张截图字节哈希、工具 SHA、未强杀/进程窗口与 profile/runtime 清理。**这仍是全零 PCM、默认非强制 muted 的离线业务 fixture**；此前强制 muted 后台暂停与未测真实 volume0 限制仍保留，未升级为有声/全编解码/官方服务/安装认证。
- 当前产物另通过 **DTO/原生窗口 11/11**（`wmusic-lyrics-integration-bjjZBP`，此前 `fVxJ8u` 也通过；最新版本加强了新序号下的关闭代次复活拒绝），与上述 Audio 11 是不同范围、含重叠路径，不相加成独立功能总数。实际 Win32 穿透 true→捕获的真实托盘 `MenuItem.click` 回调解锁 false；实际字体 slider、颜色 IPC、native setPosition 与独立 JSON 保存；同一隔离 profile 的两个真实进程自然退出/重启恢复外观及位置、无旧 track/clock；默认关闭主窗在浮窗可见时退出。父级核对两进程/子进程/HWND 清理、6 张截图哈希及全部 14 产物逐项等于 Audio 产物；其 inventory 摘要 `dbe586…` 因记录结构不同不能与 cc24c7… 摘要直比，已比较实际文件 hash 映射。**托盘为真实回调调用而非物理任务栏点击；位置为 native setPosition 而非物理拖动**。
- 重跑旧 DTO 工具曾在导航早期 epoch / 自动清空并发下返回 `STALE`（`a3ouMM`，旧工具原字节留档），原工具缺少完成文档屏障，并错误假定自己独占新文档初始 generation0；不把未捕获的单次时序硬说成唯一原因。仅修测试合同与同步：等待真实主文档 `did-finish-load` 及自动 generation0 空态，使用**更新 sequence999** 明确断言关闭 generation0 不得复活（排除仅因重复 sequence0 的拒绝），再用标注合成的 generation1/sequence0 检查 DTO 输送；重启空态允许尚未发布的 null 或自动空发布0，而任何旧活动曲目/时钟仍失败。未放宽生产顺序校验，也未把合成 DTO 当 Audio 同步。
- 本轮规范源码检查 **Node 313/313、renderer 18 文件/197 项**；维护入口 `npm run test:desktop-lyrics` 为 **Node 15/15＋Vitest 8 文件/92 项**，另 typecheck/diff 均 0，日志 `wmusic-lyrics-green-checkpoint-4cb86950da`。维持各层数量，不能重复相加成总套件数；已有 icons.ts LF/CRLF 提示仍留档。实看最小完整播放页与源翻译/逐词浮窗截图，未见图中明显裁切或重叠，**不是用户视觉批准**。
- **此前汇总重跑被拦，现已获许可并复跑修前基线**：原 `execute_code` 确认超时的请求实际 tool_calls_made=0，未重试/变体/换工具绕过；用户随后明确回复「继续」，授权修复与回归。父级重新执行确切规范入口，修前 Node313/313、renderer18文件197、歌词Node15＋Vitest8文件92、typecheck/diff退出0，快照 `wmusic-consented-review-fixes-SErBPs/baseline-manifest.json` 含11个源码/14个out字节清单及目标源码副本。**这是修前基线，不是修后通过**。独立第三上下文批次 `deleg_cfff70f7`：App/持久化测试与Audio-QA/纯负例测试两组分隔文件所有权，逐项RED→GREEN；修后规范检查/新构建/原生复验/新限定复审仍待，未授权或执行真实账号/安装/发布。
- **App/Queue 五文件独立审查已回收：不通过**（`deleg_e4010b03`，报告 `wmusic-queue-lifecycle-independent-review.md`）。前后五个 SHA 匹配，Node10/QueuePanel11 通过，但精确源码组合探针另复现两项阻塞：**L1** 非空保存挂起时用户移除最后一项，旧保存成功后直接 install，最新空保存仍在 1200ms debounce；**L2** 唯一一次空保存返回 `{ok:false}`/null 被忽略，空态周期 callback 又全部跳过，恢复保存能力后仍不重试/不提示，可能在重启恢复旧队列。这里是合成替身下真实 App 源码的错误调用顺序/失败处理，不是已观察到真实磁盘或安装损失。JSON 串行写不能补救尚未发出的请求。原生 11/11 不覆盖这些并发/失败路径，不能用它撤销审查阻塞。问题仍未完成修后验证；用户「继续」已解除本轮修复/回归暂停，App/测试限定第三上下文正在逐项RED→GREEN处理，不借此执行真实安装/发布。
- **Main/controller + Audio-QA 三文件审查已回收：整体不通过**（`deleg_5c50bbf3`，`hermes-verify-lyrics-reload-4j7t4rrt/independent-bounded-review.json`）。限定 reload controller 未发现阻塞，原 B1/14 旧测试/mock 保留；独立 focused controller18/18、policy/model10/10，三个源码哈希前后一致，并将 controller 实际编译函数与源码做限定归一化比较。**失败位于维护的 Audio QA 门禁**：① `getBackgroundThrottling`/配置仅记录不强制为 true，实际 backgroundObservation 纯重放在 hidden/minimized 都为 false 时仍放行并报告未改节流；② consoleErrors/mainErrors 不影响 accepted，注入意外错误 sentinel 仍 accepted。须补相应负控制、显式精确已知警告允许范围，并拒绝其他诊断，完整11与 epoch-only 分离不变。旧 J5XDGH 实际记录有效节流 true、mainErrors/renderer 异常为空，console 有三条 meta frame-ancestors 被忽略的 CSP 诊断；审查确认工具与14产物绑定及16截图哈希，不声称既有播放记录伪造。**历史11项观测保留，但撤回将该辅助工具绿灯当作最终原生验收放行的资格**。没有新 build/native 执行，DTO 工具不在这份审查范围内。用户「继续」后，QA限定第三上下文已启动逐项修补/负控制；尚未交回修后验证，不提前标为通过。旧 B1 只代表旧 startup-only 范围；整体仍非全树安全、当前包体、安装、账号或发布认证，仅本批限定所有权允许写入，shared out与交付保持冻结。

## 审查问题修复后检查点（新限定复审待回，未打包）

- 用户「继续」后已完成批次 `deleg_cfff70f7`。App/测试所有权两文件逐项RED→GREEN：L1挂起旧保存再移除最后一项，旧源码提前install的RED→最新队列/index稳定确认后才继续；连续变更最多3次即中止并可重试。随后L2 false/null空保存失败的RED→dirty保留/周期恢复重试/成功后停止空态重写/在途合并/失败通知去重。共享真实源码refs/effects/action共21项、QueuePanel11、类型通过；不称真实React整体/磁盘/安装成功。App SHA `9b97c5e9…`，测试 `57f556ba…`。
- Audio工具仅+12/−2行、无helper：有效后台节流必须true且配置非false，summary由观测推导；精确主文档/警告允许范围，任何意外console和所有main错误均拒绝full11及epoch-only。节流3RED→3GREEN；诊断4RED（另3旧过）→7GREEN；含自然已绿边界的实际源码纯测试82项通过。脚本 `41a14418…`、测试 `3aa27841…`；旧J5报告/产物未改。
- 父级核四文件SHA/未分配源字节与修前14out不变后实际执行 `npm run build` 退出0；新14产物清单SHA **`df55ae22bfe8cdfa11cbd02c7a64ebe3523b03423e33975051eb1ab4c18ad374`**。修后播放重载诊断 `Hqr5mt` **1/1**、实际单Audio/自动publisher/native整组 `2mNfIS` **11/11**。父级机械核计划/步骤/0未执行、raw三条精确已知CSP诊断/0意外诊断/0main及renderer异常、有效节流true、14out与16图hash、自然退出与profile/runtime清理。仍是默认非强制mute全零PCM离线场景，不认证强制mute或volume0后台、真实编解码/账号服务。
- 同产物DTO工具第一次重跑 `6bfQmZ` 为9项通过、第10项主窗state查询 `RATE_LIMITED` 失败，原JSON与精确 `failed-harness.mjs` 保留；没有降低生产10/s、burst6。父级只修工具观察helper：真实副窗可用时读副窗窄state，首建前/旧进程关闭后仍真读主窗；顺序观测先等150ms，不吞错/不自动重试。路由与缺少间隔各实际源码RED→GREEN、其余边界自然GREEN共5项。重跑 `P3Mqnw` **DTO/native11/11**，与Audio同14out逐文件一致、6图hash、同profile两个真实进程外观/位置恢复及清理已核。工具 `2c356859…`、测试 `cc948086…`。该工具只变观察路由/间隔，不替代主窗真实命令证明，也非第二组Audio/物理托盘/物理拖动。
- 修后确切规范入口：**Node411/411，renderer18文件197项，歌词Node102＋Vitest8文件92项**；类型、两工具语法、diff检查通过。专题与全量重叠，不重复相加。日志为 `wmusic-consented-review-fixes-SErBPs/parent-current-*.log`；此前406/97为加入DTO5项前检查点，仍保留。icons.ts既有LF→CRLF提示不隐去。
- **新独立审查 `deleg_3135db1c` 待回**：App2文件与QA4文件分隔范围；输入 `fresh-review-input.json` 绑定6源码/新14out，父级不再写这6文件或重建out。测试绿不代替新审查；旧两份失败及QA历史报告保留，不回写成通过。当前是源码/离线原生检查点，不是最终源码导出、候选包字节绑定/打包运行、全树安全、已安装升级或用户视觉批准；安全依赖门禁仍未完成。

## 修后限定独立审查已通过（仍非全应用/发布认证）

- 批次 `deleg_3135db1c` 已完整交回，父级读回 `independent-queue/verdict.json`/`report.md` 与 `independent-qa/review-report.json`：两项 `passed:true`、`hashes_match:true`、安全/逻辑阻塞列表均空。父级再读实际6源码/14out并核对受审清单，当前仍精确匹配，out清单仍 `df55ae22…`；未修改已审源码或重建产物。
- App限定审查独立执行21项真实源码回调、QueuePanel11项，补充8项当前自然GREEN与2项旧源码负控制，核清在途autosave→安装的串行契约、busy失败吞debounce后dirty重试、旧ack不得清新意图、保存失败恢复与启动保护。该结论仅覆盖本次两个文件的队列保存/安装前置delta，不认证整个App/React整体/真实磁盘/安装。
- QA限定审查独立执行82＋5项聚焦、38项补充纯反例、37项记录校核；四源码哈希前后稳定，保留原raw警告/失败。新的full11/epoch1/DTO11记录、工具/14out/22图字节及既有生命周期记录被校核，**不是审查人重跑native**。DTO观察helper150ms仅为当前顺序调用，不是通用并发限流器；DTO未收集console/main，不声称这些诊断为空。
- 两份建议均非阻塞：把在途保存与busy失败/consumed debounce、deferred sleep/页面状态变更/双路限流及transport错误等补充纯用例维护化。当前补充探针已绿；为保持受审字节冻结，不在结项时临时改测试再借用旧批准。
- 本次两类审查阻塞已关闭，源码修补/确切规范入口/构建/离线原生与限定独审各层分别保留证据。整体内容语义、真实头像/服务、依赖安全、完整源码导出/当前包体与打包运行、安装升级和视觉批准仍未完成；无新提交/安装/发布。不得将本节写成全软件安全或交付完成。

## 依赖升级隔离试验（合入前历史阶段；当前状态见下一节）

本节保留隔离阶段的实际时序和失败；“主工作区未更新”仅指当时，不覆盖后续已执行的最小合入。

- 新授权「继续」后核对真实安装副本及当前工作区：仍为Electron44.7.2、生产Undici7.30.0、node-gyp独立6.29.0、fast-uri3.1.8。主package/lock副本及安装路径清单在scratch `wmusic-dependency-remediation-03qIoY`。主工作区原有修补/受审6源码与14out未被依赖试验替换。
- 实际匿名公开HTTPS取得四候选精确npm元数据、四家owner公告列表、发布标签和minimatch curated记录，共13份有实际获取时间/原字节SHA的响应；网页提取器此前private-network错误另记失败，不当作来源正文。初始委派上下文把未抓取页面误称已观察，已向两个研究上下文明确纠正为未验证线索；`parent-provenance-correction.json` 留痕，后续真实HTTP观察不倒填时间。
- 仅在独立trial目录安装：Electron **44.11.3**、生产Undici **7.30.2**、node-gyp范围内Undici **6.29.1**、Ajv范围内fast-uri **3.1.9**。只有这4个package版本改变，无强制major override、无builder降级；同major嵌套约束已用实际semver库检查。初装ignore-scripts、空npm user/global配置、普通严格TLS；随后在trial提取带上游checksums校验的Electron二进制，不执行应用安装器。252个允许的源码/资产逐字节复制，无private配置/.local/research/发行目录；初次renderer因缺glyphs.json失败原日志保留，仅补原声明fixture后重跑，未弱化断言。
- trial确切规范检查 **Node411、renderer18文件197、歌词Node102＋Vitest8文件92、typecheck/build均0**；候选真实运行时记录 **Electron44.11.3 / Node24.22.2 / 内嵌Undici7.30.1 / Chrome152.0.7977.169**。默认非强制mute零PCM下实际单Audio/自动publisher/native `8iXDZ2` **11/11**、DTO/native `qZOSDS` **11/11**、epoch诊断 `REdzfR` **1/1**，截图hash/自然退出/profile清理核过。编译14out恰好与现主工作区同SHA `df55ae22…`，**外部依赖与Electron EXE不同，所以绝不能仅用out相同证明运行时相同或借用旧认证**；候选EXE SHA `ad6fd763f293e3edeec1ee339bf4b6a4beb0a4df7667550109c356a070c06995`。绑定见 `trial-compatibility-checkpoint.json`。
- **兼容通过不等于安全通过**。两个独立只读研究 `deleg_7e1163eb` 已回收：父级读取报告与部分原始记录、复核Electron研究manifest所列 **111份文件**的实际大小/SHA，并确认主package/lock及 **6份minimatch副本**仍为原字节。失败编辑所指的 `electron-research/finalize_research.py` 实际不存在，也未列入111份manifest；不称该脚本成功、不以补造文件代替核验。读回记录在 `parent-research-readback.json`。
- minimatch当前 **无完整兼容的第一方升级链**：builder/app-builder-lib26.18.1仍要求minimatch^10.2.5和universal2.0.3，后者仍要求^9.0.3；27.0.0-alpha.14虽换universal3，仍保留builder自身10.x。没有已发布的官方修补9/10分支；不要把升builder、加根universal3或强制11 override冒充完整修复。owner-only c859另覆盖当前9/10，早期11还有其他公告，旧11.0.1目标不充分；当前研究的11.0.9只是未来兼容候选，未经本项目实测。现有调用未启用optimizationLevel>=2，仅缩小特定优化器路径，不能删除版本风险或概括为一般DoS安全。
- Electron44.11.3官方源码/版本与候选实际运行时一致：Node24.22.2、Chromium152.0.7977.169；eMudhra修复阈值44.9.1及Chromium/Node SPKI回移植已由研究核对。GHSA-vv43-5jgx-7qv8的开放版本匹配仍保留，owner原文明确仅影响macOS的Squirrel.Mac自动更新，Windows平台不适用；不虚构44.x修复上限。
- 内嵌Undici **7.30.1并未由外部7.30.2修复**。研究扫描64个Node patch，未发现Undici改动，生成builtin仍是旧SRI空白分隔解析；六条可解析7.30.2公告版本匹配仍保留，其中五条有缓存/重定向组合前提，当前生产源码未见这些组合或SRI参数。这只缩小已观察调用，不代表全不可达。Node24.22.3及额外安全修复未证纳入本Electron候选，仍是厂商/适用范围门禁。
- 新专项 `deleg_381c9990` 已回收：维护化外部Undici实际HTTP SRI先在旧7.30.0复现错误响应体被接受，再在trial7.30.2通过；冻结外部文件46/46，旧Root29通过/17失败（含矩阵父容器，不是17条漏洞）。隔离原生网络宿主两次各64观测/56接受/8个builtin SRI安全失败，CLI1。合成鉴权重定向、TLS信任/主机名正负对照、显式proxy/NO_PROXY、取消清理及net/Chromium基本路径有据；不是实际账号/IPC/CDN或所有interceptor组合测试。子级旧哈希207c52…/33d81b…及首轮诊断/字段命名纠正保留，父级后续环境读取修补的新运行见下节。
- 公告匹配器初版把GitHub逗号AND区间直接交给npm-semver，实测RED证实静默漏匹配；初版count1文件已保留并标记**不可信、不是安全证据**。保留原始范围，另用显式语法适配与8个正负边界修正。31条含分号或非标准写法仍明确unparsed，不修造源token、不默认为不受影响。额外curated列表补核遇实际HTTP403已停止，不读token或重复轰炸；这部分仍未收束。因此不发表漏洞已清零或完整安全放行。
- 隔离阶段结束时主manifest/lock与二进制尚未更新；原源码限定独审只属其旧依赖上下文。下节另记后续实际主根合入，不把后来的通过倒填为当时成功。

## 主工作区四项最小依赖合入（已执行；限定源码审查分批通过，产品安全仍拒绝）

- 父级先亲自重现旧外部7.30.0的最小HTTP错误body接受，断言退出1；再发现测试宿主环境构造器先`Object.entries(process.env)`后过滤会读取不允许的值。以完全合成getter执行实际helper取得1失败/1自然通过，再最小改为先枚举/筛选键、只读允许值，纯门禁9/9；未取真实认证值作夹具。原子级文件/报告留存，不把旧207c52…哈希作为当前工具证明。
- 父级用修补后的同一网络宿主实际测旧主根：Electron44.7.2/Node24.21.0/builtin7.29.1、外部7.30.0，64观测中48接受/16个SRI失败，非测试宿主失败；自然退出/清理核过，记录`root-promotion/native-before/run-qOnDQM`。
- 已合入并实际安装 **Electron44.11.3、生产Undici7.30.2、node-gyp范围Undici6.29.1、Ajv范围fast-uri3.1.9**。锁文件与已验证trial的JSON精确相同，只变四package版本/下载来源/完整性和根metadata；manifest另加两个显式测试入口。使用隔离空npm配置与已有cache执行`npm ci --offline --ignore-scripts --no-audit --no-fund --include=dev`退出0，再标准提取Electron退出0，不运行应用安装器。未升级builder、未强制minimatch跨major；原技术名/appId/数据兼容/AGPL/更新源不变。
- 主根规范重跑：**Node466/466、renderer18文件197/197、歌词Node102＋Vitest8文件92、网络专题55/55（外部46＋纯9），typecheck/build/diff均0**。专题与全量重叠，不相加。`test:network-security -- --help`从缺脚本RED到真实帮助入口GREEN，帮助不是网络安全通过。
- 新依赖/重建后父级重新执行真正编译主程序：Audio **JklAzO 11/11**、DTO **LRx4tR 11/11**、单独epoch **tw7Pjw 1/1**；22份原生截图大小/SHA和自然退出、profile/runtime清理核过。DTO和Audio清单序列化SHA不同，逐14文件比对其内容SHA一致；受审旧6源码及14out字节仍匹配，不因out相同借用旧框架证据。实际新Electron EXE SHA为`ad6fd763f293e3edeec1ee339bf4b6a4beb0a4df7667550109c356a070c06995`。
- 主根网络专项实际运行`run-T4uANY`：**64观测、56接受、8个安全失败**；所有剩余均builtin fetch在HT/LF/FF/CR错误SRI前缀下错误接受，涵盖dispatcher安装前后两阶段；外部实现拒绝正确。与旧Root比较只消除了外部8项，**不是8条独立漏洞，也不是完整安全放行**。真实Node24.22.2/内嵌7.30.1，原始报告SHA`656ddfdfe2395096e36a05ec89fab326ba905ed8d09772990a45bf73287b27e1`；`operationSucceeded:true`但`securityAccepted:false`、CLI1保留，清理成功不转成安全成功。
- 五文件曾静稳冻结，`root-promotion/review-input.json`保留该旧目标与规范/四类原生报告/22图绑定。`deleg_8eea4df1`已完整回收：**依赖/外部回归3文件通过**（d56cb788…/48951a82…/70b0cf6f…，真实46项三次重复及10组纯控制；不累加为更多唯一测试），但**原生工具/纯门禁2文件未通过**（c68e7681…/a3ee2611…）。前者审批不能覆盖后者，更不是全软件安全放行。
- 两个工具阻塞来自完整原模块合成重放：**R1 High**只凭命令行包含run-root就把PID纳入`taskkill /T /F`，甚至预检失败尚未启动Electron也会误伤无关evidence reader；PID复用也无归属证明。**R2 Medium**scratch仅词法resolve，外部junction别名可将临时写入导向受保护仓库/runtime。审查无真实进程信号，真实junction夹具只在自有scratch并已删除，不称实际误杀或真实仓库越界事故。报告/重放在`root-promotion/review-native-gates`；9维护化纯用例/56纯重放控制/42字节校核通过并不能消除这两个实际源码缺陷。
- 已暂停执行旧版原生网络工具，`deleg_b987ae29`第三独立修复上下文只拥有这2文件，现已交回第一轮修补；逐R1→R2实际源码RED→最小GREEN的原日志保留，未运行真实kill/原生启动/安装/build或变更依赖。已通过3文件、旧6源码/14out保持保护，证据在`native-gate-fixes-round1`，新的父级复测与独审状态见下节。旧T4uANY的64/56/8实测观察不回改，但不能认证后来修改的工具。
- 外部库原修补与候选源捕获早于首个RED测试；只声称本地真实HTTP复现/升级前RED→升级后GREEN，不认证上游修补由本轮测试驱动或实现盲TDD。仍保留minimatch9/10、内嵌Node厂商修补及未知range残余；无当前最终源码导出/新安装包/包体验收/应用安装/提交/公开发布。

## 两工具第一轮修补与新限定审查（2026-11-17；未安全放行）

- 第三上下文仅交回两文件，冻结为 `tools/test-wmusic-network-security.mjs` **34146f893c2c542dfb18a0d56651462084f17b838f61a56971597eab9bb17b39**、`test/network-security-report-gates.test.mjs` **72e0fd2094a8bae8e49802a7860f61b8cd79cc8df67e2128f4a8b947d80c9aa5**。R1实现移除substring归属发现/查询结果转owner及PID/tree强杀；存活或复用PID拒绝强制清理并保留失败，仍经保留的inspector连接请求quit和核自然退出。R2实现首写前canonical保护根/最近现存祖先、canonical路径写入、创建后复核与失败后拒绝进一步危险访问/递归删除。实现存在不等于独审通过。
- 父级读取真实断言日志：R1 **1 RED→1 GREEN**，再R2 **2 RED→2 GREEN**；维护化纯测试亲跑 **40/40**（原9、R1七项、R2二十四项），其余 **28项新增控制自然已绿**，不伪称新RED。首个ReferenceError属于测试初始化错误，不冒充产品RED；原始修前/修后日志不改。
- 父级在首轮快照（第二轮之前）亲跑规范 **Node497/497、renderer18文件197、歌词Node102＋Vitest8文件92、安全专题86/86（外部46＋纯40）、typecheck/build/diff退出0**。专题与全量重叠，不合计为更多唯一测试。批准3文件、旧受审6、全127src、14out及10份原审查文件逐文件大小/SHA未变。最初父级freeze检查因DFS清单与全路径排序比较而失败，仅修父级比较器为相同路径集合/字节并拒绝重复后通过，不改产品或历史清单、不冒充产品RED；这些检查不批准第二轮修改中工具。
- **父级先前helper初查（后续完整重放已确认）：** 在自有scratch的repo/runtime合成根实际创建并realpath `..legitimate-child`，首轮exact `inside` helper两项都错判outside，另外六项正常。8项helper对照本身不等于完整启动器重放，更没有写入真实仓库；夹具与临时验证器均已删除并读回absence。初查证据 `native-gate-fix-parent-checks/parent-containment-boundaries.json`，后续独立完整重放与阻塞结论见下。
- 首轮两文件限定独审 **deleg_20d2de51已回收**：`review_completed:true`、`digest_match:true`、`passed:false`，正式报告/裁决在 `native-gate-fix-review-round1/report.md` 与 `verdict.json`。**R1只在源码级synthetic范围通过**，不是真实进程证明；两项R2阻塞见下。未运行真实Electron、进程信号/查询、安装或重建。原生工具继续暂停，旧64/56/8及其securityAccepted=false/CLI1仍是旧hash历史测量，不认证本轮工具。
- **R2-PATH-SEGMENT / Medium已确认：** 独立完整ES-module冻结源码、纯内存FS/进程重放，在repo/runtime两根各覆盖direct/nested/dotdot alias/nonexistent leaf，共8场景，每场10个protected mutation（建run/live/evidence、写证据与递归删live），最终CLI1不能撤销这些副作用。父级已解析原JSON核数量；原helper8项只是初步证据，不与完整重放混为一类。额外自有scratch物理helper20控中6错、6个junction均finally清除，真实仓库/runtime从未作为目标；不是已发生真实仓库越界事故。
- **R2-FAILSTOP / Medium已确认：** `protected-root-drift-after-baseline` 在sequence79发现repo canonical身份失效并latch unsafe后，finally仍调用governedInventory(repo)，继续16条新目标readdir/readStream/readFile；这些是完整源码synthetic effect，不是读取了真实私人文件或已发生外传。应在失效后停止危险inventory/readback，保留安全拒绝与必要的独立资源处理。父级已读全report/verdict并解析effect账本，不以40/497全绿覆盖。
- 新独审范围与历史资料未回改：受审34146f89…/72e0fd20…与批准3/旧6/127src/14out保持原字节，审查本身执行完成不等于通过，也不扩大为产品/包体/供应链放行。
- 限制保留：拒绝强杀可能留下无响应进程，必须报告清理失败而不是自行猜归属；路径复核不是对抗恶意并发reparse替换的原子文件系统sandbox。未扩S1–S5、未修改生产主/预载/账号协议、依赖、系统设置或更新权限，也无本轮新包/安装/公开发布。

## R2第二轮限定修补（历史独审失败/自动轮停止；后续单项授权另记）

- `deleg_869455b9` 新第三上下文已经交回，只改原2文件；工具差异仅精确 `..`/`..+sep` 的inside谓词和final governedInventory前调用既有verifyRoots，不扩R1/S1–S5。当前冻结：tool **37a85482e0c9120aa8643b363cb3da25ecac0e205522e5cbe3619904982e3bb8**、pure **76965cd9c732303a31bafb819f2dc369775741099bcb2a8429912961d470d1fc**；before/after/frozen、报告及原始证据在 `native-gate-fixes-round2`，父级读取了两份实际产品断言RED日志和两份完整diff。
- 逐问题完成PATH-SEGMENT八项实施前RED→GREEN后才进入FAILSTOP核心一项RED→GREEN；维护测试父级亲跑 **64/64**，保留原40。新增24分为 **9项实施前RED→GREEN、5项实施后fix-dependent变体、10项自然绿**；修后变体对保留修前源码失败仅是事后反例，不倒称实施前TDD。实施者补充完整ES-module **28场景**中8失效/4retained inspector场景检测后FS为0且保留quit，属于合成自检而非新的独审/原生证据。
- 父级独立亲跑当前规范 **Node521/521、renderer18文件197、歌词Node102＋Vitest8文件92、专题110/110（外部46＋pure64）、typecheck/build/diff0**，专题重叠不累加。批准3、旧6、全127src、14out、immutable10与上轮reviewArtifact6均逐文件原大小/SHA；复制的父级新frozen与750ms静稳核过。子级两条no-index --check原始CLI1及LF/CRLF提示、tracked diff0和icons警告均保留，不将untracked检查或警告伪写成全无输出。
- **新独审 deleg_ccef67ec已回收且失败**，正式report/verdict与逐场景证据在 `native-gate-fix-review-round2`；review_completed=true、digest_match=true、passed=false。原R1和R2路径/检测后危险IO阻塞在源码级synthetic范围关闭，维护64/64与syntax通过；独立完整原字节模块104控为98过/6例失败，verifier CLI1，不能用普通绿灯替换独审结果。没有新native、真实进程操作、安装或发布。
- **仅剩一项逻辑阻塞 R2-UNCHANGED-STALE / Medium：** final inventory及governed-after写入成功后、stdout/evidence输出前的repo/runtime根校验出现drift/EACCES/一次错误后恢复，失败已latch且不再FS访问；然而最终summary仍保留`unchanged.verified=true`。六场景是同根因变体，整体securityAccepted=false、CLI1、report未持久化、检测后FS为0；不是安全接受、危险IO继续或真实仓库事故。失效前hash可留作明确历史快照，不能继续当当前认证。父级已读完整报告并解析6条最小实际源码轨迹，未自行改代码。
- 独审完整性分层保留：受审2、批准3、旧6/src127/out14/原339历史文件未改；审查期间父级另目录新增6份postdoc证据，结束命名空间339→345，因此广域snapshot unchangedFromStart=false、原CLI1未回改。逐项确认只是新增并不等于广域快照通过，也不影响上述逻辑缺陷结论。两处reviewer模型/定位假设修正均只在其独占目录，原失败和修订已保留。
- **两轮自动fix-reverify用尽后，当时已停止自动补修并升级处置。** 37a85482…/76965cd9…失败快照保留，未擅自启动第三自动轮；其后用户单项授权见下，不回改原暂停/失败记录，不能借旧绿灯恢复原生执行。原生专项继续暂停，旧64/56/8及builtin错误SRI接受的安全拒绝仍属旧工具SHA；最终源码导出、包体、安装/重启/发布与供应链残余独立待。

## 用户继续后的认证字段单项补修（限定新独审通过；非原生/产品批准）

- 在两自动周期停止、父级升级报告并提出“仅补该字段/回归、再独审，不运行原生/安装/发布”后，用户最新原文为 **“继续”**。按紧邻上下文解释为该单项的额外一次授权，不扩大为更多自动轮次；旧clarify超时/unanswered原记录不回改。新记录在 `native-certification-authorized-fix/user-authorization.json`，包含原文、解释范围与明确排除项。
- 父级核before37a85482…/76965cd9…与批准3/旧6/src127/out14/审查摘要匹配，保存before/handoff并亲跑修前64。`deleg_3c98c0d2`新第三上下文已停止写入，仅交回2文件：tool **fd43a7a8a3ca42d681fdf3c9ee7fe6eefa782f5e942ef1d7c7ad77884878174a**（60106B）、pure **146f88c1fdc97c5987d91050b6deb678a28f6de338d995b9840e0366f83eed7e**（50032B）。工具只在原verifyRoots catch增6删1行：已有unchanged改verified:false/invalidated:true，保留hash并明确inventorySnapshot为historical-only；正常不变根仍true，不扩R1/S1–S5或业务协议。
- 实际核心断言先见true!==false的1项产品RED，稳定根对照自然绿，再最小GREEN；新增26明确分 **1实施前RED→GREEN、23修后依赖变体、2自然绿**。同最终测试对保留修前源码24失败/2通过是事后反例，不追称TDD。维护纯文件父级亲跑 **90/90**；8个原字节ES-module补充自检不等于新独审或native。故障后无FS/无再realpath、独立quit/自然退出事实与既有64控制保留，旧失败日志不改写。
- 父级当前实际规范 **Node547/547、renderer18文件197、歌词Node102＋Vitest8文件92、专题136/136（外部46＋纯90）、typecheck/build/diff0**，专题与全量重叠不相加。文档后Node547/typecheck另跑；新独审只按manifest指定路径核这些既有日志，未重跑/累加，也不借旧521/64或旧native绑定当前字节。
- **全新独审 deleg_61aa274d已完成且通过：** `native-certification-authorized-review/report.md`与严格verdict的review_completed/digest_match/passed均true，security_concerns/logic_errors/suggestions均空，限定source-only/non-native。完整原字节ES-module132/132（含旧104全部重新执行）、维护90/90、独立pure129/129分层通过；原六例及四相邻验证时机合计24晚期组合撤销verified并标invalidated/historical-only，正常稳定根仍true，故障后FS/再realpath为0，retained inspector正负例和natural/forced/operationSucceeded事实保留。新模型执行修前六例0/6、CLI1是事后历史负控制，不是新失败或新TDD。
- 父级已正式回读完整report/verdict、程序重计132/129/6并核原始9条命令日志、58份交付artifact与537份既有历史字节；受审2、批准3、旧6/src127/out14、冻结docs3、研究矩阵仍匹配。reviewer结束后用户三项产品答复仅更新未在保护输入中的决策JSON与promotion外确认卡；steer未送达，不能倒称reviewer见证该更新。父级再核保护字节后才更新当前三份进度文档，不回填旧review-input或旧审查历史。
- **广域guard失败不掩盖：** 子级记录非owned文档从52528B/ddafa8bd…变为52520B/bba50e74…，且新增父级writer-scope-guard；父级以当前文档反向替换自己上一条精确paragraph patch，结果大小/SHA完整匹配修前记录，因而逐字节归因本父级文档编辑，非猜测归责子级。证据 `native-certification-authorized-parent/scope-drift-attribution.json`；原broadGuardPassed:false/CLI1与395→396命名空间变化保留，不能当作广域不变。原有受保护源/历史输入另行哈希核验。
- 本次用户限定的补修与新独审已完成，原R1/原R2及认证字段阻塞只在源码/合成范围关闭；未新增真实native/进程操作、安装、发布、账号/系统/依赖授权，不重启自动补修。旧native64/56/8、securityAccepted:false/CLI1与builtin错误SRI接受仍为原字节历史事实，不能认证新工具。其他供应链/包体/真实服务门禁仍独立待。

## 集成与交付门禁

各模块仍待统一跨层整合与最终候选冻结；当前局部检查不代表打包验收。打赏检查点曾实际执行 Node 298/298、渲染器 132/132、类型检查、构建及 diff 检查，均退出 0；之后的歌词修改已经超出该旧检查点，最新范围以上节为准。这些执行结果不代替真实账号、安装/升级、打包字节绑定或用户视觉批准。所有生产修改汇总后再运行规范检查、来源/图标字节绑定、真实打包探测和清理。保留原技术标识、数据路径、已授权更新仓库、AGPL/NOTICE 与非官方说明，不自动安装、重启或发布。

### 历史只读triage基线（仅seed，不是当前依赖或完整公告集）

旧 `npm audit` 曾报 9 项依赖问题（7 项中、2 项高），不能将“代码测试通过”写成“安全审计通过”。当时只读研究已回收：证据为 scratch 下 `wmusic-dependency-security-20261117.json`，20 个唯一 owner advisory 的机械去重计数已复核；父级另用无凭据新浏览器实际重核 Electron、Undici、fast-uri、minimatch 四份一手页面，DOM 摘要记录为 browser-use workspace 下 `wmusic-dependency-parent-verification.json`。提取器的 private-network 报错和第一次保存脚本错误不是来源证据，保留为失败观察；只采用随后真实获取并保存的页面。以下候选/未更新描述只属于该历史时点，当前版本以上节为准。

- Electron 44.7.2 的安全修复下限是 44.9.1，研究核实的同大版本维护候选是 44.11.3；**44.7→44.11 是同 major 的 minor 更新，不称严格 patch-only**。devDependency 标记不能把已随客户端分发的 Electron 框架算作仅开发工具。
- 生产 Undici 候选为 7.30.2，而非停在 7.30.1；维护者 7.30.2 发布说明另列六项修复。node-gyp 的独立 6.29.0 副本也须独立处理，兼容候选为 6.29.1，不能因根依赖 7.x 更新就声称该副本已修。
- fast-uri 3.1.9 符合现有 Ajv 的 3.x 约束。旧公告登记的minimatch11.0.1超出builder/universal的10.x/9.x约束，且已被后续研究证明不是当前充分目标；当时尚无已证兼容同major修复，不强行override到11、不把builder倒退到25.1.0、不把未解决项抹成通过。
- npm bulk feed 与 owner advisories 的覆盖存在差异；软件包审计计数、唯一公告数和实际可利用性不是同一单位。可选 Undici 功能在本客户端的实际可利用性未审定；不宣称发生过攻击，也不把 feed 未列出等同于没有漏洞。
- 当时只完成核实与修复门禁登记，**尚未更新主工作区依赖或Electron二进制**。父级读回manifest/lock确认当时仍为44.7.2/7.30.0；该旧锁/读取期间不变记录不扩大为现在。后续合入与重验另记上节；旧运行时、安装器哈希及签名/校验和证据不得挪用。
- 增强原生报告另实际记录 Electron 内 Node 24.21.0 / 内嵌 Undici 7.29.1，而项目外部包为 Undici 7.30.0；这与开发 CLI 的 Node 是不同运行时。更新外部依赖不能证明内嵌实现已更新。后续须核对更新后的真实 `process.versions`、厂商回移植与本项目实际调用来源；仅版本范围匹配不足以断言厂商内嵌代码可利用，也不能忽略这个独立核验门禁。
