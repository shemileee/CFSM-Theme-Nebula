# CFSM Theme Nebula 0.1.3

为 [CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 移植的 Nebula 像素方块风主题。独立 Vue 3 + Vite 前端，交互控件采用 Ant Design Vue；不修改 Worker、D1、Agent 或管理后台。

## 0.1.3 修正

汇总栏按参考图统一：中性描边图标、实时网速/节点/最忙节点/总流量标题、常规字重；最忙节点百分比在前、名称在后；总流量分别展示月度下载和上传累计，不再显示双向合计。

## 0.1.2 修正

空的 Node 1–4 不再根据 null 延迟误判为已配置；loss=false 禁用优先于旧历史数据，合法的 0ms/0% 保留。线路名称同时读取 sysConfig；12 项单元测试与 6 组模拟浏览器场景通过。

## 0.1.1 修正

紧凑双列汇总与自适应窄卡片，去掉大标题；上传采用绿色；无限流量不再显示满格。线路默认展示两条、其余展开，无内部滚动条；独立显示延迟与丢包色带，缺失丢包显示无数据。浏览器回归新增这些展示断言。

## 已实现

- 浅色 / 深色 / 初始跟随后台或系统；像素资源条、网速小波形、标签、分组、搜索。
- 汇总卡、到期提醒、按 CFSM 计费方向计算月度流量、真实延迟窗口。
- UUID hash 详情路由；资源/延迟/丢包图表，历史图表按需加载。
- 单次初始 REST + WebSocket 增量合并，首页最多每秒更新一次；不执行 HTTP 定时轮询。
- 单机详情单独订阅；隐藏页面断开；断线指数退避且最多重连八次；连接到期须手动继续。
- 公开/私有站点、JWT、Turnstile 凭证缓存，错误不自动无限刷新。
- 多 apiBase 分站读取和订阅，ID 与缓存按后端隔离。
- 管理入口始终为原后台 `/admin#/admin`；页脚保留 CFSM 链接及版本。

## 构建和运行

Node 22+：

```sh
npm ci
npm run dev
npm test
npm run build
```

默认同源 API。开发时可在 `.env.local` 配置代理：

```dotenv
DEV_API_BASE=https://你的CFSM域名
```

跨域静态部署使用：

```dotenv
API_BASE=https://你的CFSM域名
# 可用英文逗号分隔多个 HTTP(S) origin，不包含路径。
```

每个源站须配置 `CORS_ALLOWED_ORIGINS`，加入真实前端 origin，并保证 CSP 允许 API、WebSocket 和 Turnstile。不要把 API_SECRET、账号密码或 JWT 写进构建环境和静态包。

`dist/` 仅包含 `index.html` 和 `assets/`。

## 安装到 CFSM

当前 CFSM 从 GitHub 主题目录读取构建产物，**不是上传极简探针 theme.tar.gz**。

1. 将构建好的 `dist/index.html` 和 `dist/assets/` 原样提交到你自己的 GitHub 仓库目录，例如 `themes/nebula/`。
2. CFSM 后台主题页的自定义主题 URL 填对应目录链接，例如：
   `https://github.com/你的账号/你的仓库/tree/具体提交SHA/themes/nebula`
3. 先预览，核验真实数据、鉴权和图表，再应用。使用具体 SHA 可固定版本。
4. 后台仍由默认主题接管。需要回退时，在原后台恢复默认主题即可。

仓库构建产物保存在 `dist/`，可用此目录的 GitHub tree URL 在 CFSM 后台预览。主题商店发布和线上应用需另行操作。

## 数据口径

- CPU 百分比；RAM/Swap/磁盘容量 MB；流量 B；速度 B/s。
- **`traffic_limit` 按当前 CFSM 默认前端代码解释为 GB 数值**，转换为字节（`GB × 1024³`）。主题开发文档的详情示例出现 `"1TB"`，与实际默认前端实现不一致；本版遵循默认前端，不按示例字符串推断单位。
- `traffic_calc_type`: `dl` 下载 / `ul` 上传 / `max` 最大方向 / 其他双向合计。
- ping/loss：`false`/缺失不展示，`null` 超时，`0` 有效。首页只使用列表已有窗口，禁止逐台请求历史。
- 延迟色带按真实样本时间，窗口标题读取配置；不是伪造“每格一小时”。
- 首次汇总在线数采用后端 stats；实时合并后按同一 5 分钟阈值更新。
- 不伪造原主题的每日流量；不读取管理端私有 note、IP 或其他字段。
- 详情默认 10 分钟；只有改变时间范围才重新查询历史。换图表标签复用同一历史响应。
- `/api/config` 缓存；Turnstile 开启时验证及验证缓存恢复需要额外调用此接口，属于鉴权流程。

## 测试与验收边界

```sh
npm test
npm run test:browser
```

浏览器测试使用系统 Google Chrome（可修改 `test/browser.mjs` 的 channel），在本地 Vite 端口 5179 上运行，使用**模拟 API、WebSocket 和 Turnstile**，不会连接真实服务器或进行 Cloudflare 验证。截图位于 `test-results/`。

已通过：11 项单元测试 + 6 组浏览器场景，含桌面、390px 手机、四种公开/私有与 Turnstile 组合、实时合并、无轮询、搜索、详情刷新、历史复用、深色模式。构建成功，Vite 对主 JS >500KB 给出体积提示（非构建失败）。

**待真实部署验收**：CFSM 的四种鉴权组合、真实 Turnstile/CSP/CORS、真实 WebSocket Cookie/跨域 JWT、历史字段与单位、多后端联调、页面可见性和限时订阅在实际网络下的行为。没有完成这些前，不应宣称生产验收通过。

本版视觉为 Nebula 风格适配，不是逐像素复刻；原版 React、shadcn 和 Recharts 未整体引入。

## 来源和许可证

- Nebula：3922510-creator/monitor-theme-nebula，检查基线 `79e6c16`，MIT，见 `LICENSE`。
- CFSM：huilang-me/CF-Server-Monitor v2.8.6，检查基线 `612027c`，MIT，见 `LICENSE-CFSM`。
- Ant Design Vue、Vue、Chart.js 等遵循各自许可证。分发时保留版权声明及依赖许可。

`package-lock.json` 已保存，复现构建使用 `npm ci`。
