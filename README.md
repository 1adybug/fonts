# @1adybug fonts

用于自托管的 MiSans、HarmonyOS Sans、OPPO Sans 和 vivo Sans 可变字体包。采用 pnpm workspace；根包为 private，各字体包独立安装、零运行时依赖。

| 包 | CSS 字体家族 | wght 范围／原生默认值 | 分片 |
| --- | --- | --- | --- |
| `@1adybug/mi-sans` | `MiSans VF` | 150–700／330 | 56 |
| `@1adybug/harmonyos-sans` | `HarmonyOS Sans` | 40–900／400 | 150 |
| `@1adybug/oppo-sans` | `OPPO Sans 4.0` | 100–700／400 | 148 |
| `@1adybug/vivo-sans` | `vivo Sans` | 100–850／400 | 149 |

## 使用

```sh
npm install @1adybug/mi-sans
```

```js
import "@1adybug/mi-sans";
// 也支持 @1adybug/mi-sans/wght 和 @1adybug/mi-sans/wght.css。
```

```css
body {
  font-family: "MiSans VF", sans-serif;
  font-weight: 330;
}
```

其他包使用同样的导入方式。包只包含 `@font-face`，不修改全局界面样式。MiSans Regular／Medium／Demibold 的原生字重为 330／380／450；应用的视觉字重映射由应用自己维护。vivo Sans 保留原生 `opsz` 10–22 光学字号轴，默认值为 16，浏览器可自动适配光学字号。

## 开发环境

需要 Node.js 22.12+、pnpm 11.10.0、Python 3.12+。Windows 示例：

```powershell
pnpm install --frozen-lockfile
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r scripts/requirements.txt
pnpm exec playwright install chromium
```

脚本默认使用仓库的 `.venv`；可用 `FONT_PYTHON` 指定其他已安装依赖的 Python。浏览器测试默认使用 Playwright Chromium；Windows 已安装标准路径 Chrome 时自动使用它，也可设置 `CHROME_EXECUTABLE`。

## 生成与校验

```sh
pnpm generate
pnpm generate --force
pnpm check
pnpm test
pnpm pack:all
pnpm release
```

- `generate` 生成包的 CSS、元数据、文档和许可，缺失分片会从本仓库的源文件补齐；`--force` 完整再生成鸿蒙、OPPO 和 vivo 的 447 个分片。结果必须与锁定的 SHA-256 基线一致，否则失败。
- MiSans 保留官方 56 个原始 WOFF2；鸿蒙、OPPO 和 vivo 固定 FontTools 4.68.0、Brotli 1.2.1，按 `@fontsource-variable/noto-sans-sc@5.3.1` 的字符分组生成，保留分组外生僻字与西文覆盖关系。原始 TTF、分片来源、精确范围和全部哈希保存在 `sources/`。
- vivo 使用官方 OS 版 SC 1.05 和多语言 EN 1.150，两份原始可变字体分别用于中文及所覆盖的西文、希腊文、西里尔文字符。包保留原始 `wght`、`opsz`、字距与布局特性；不混用品牌静态字重、繁体专用字形或单字重 L3 扩展字体。
- `check` 验证输入与所有生成产物。`test` 逐字比较轮廓、hinting、占宽、行高和可变插值，额外核对 vivo 在完整 wght／opsz 采样网格中的 HVAR 占宽，完成 490 组浏览器像素对照，并从实际 tarball 安装到隔离项目，验证三种入口、TypeScript、Vite 与嵌套部署路径。
- `pack:all` 的产物和文件清单位于 `output/`。发布白名单不包含原始 TTF、生成脚本、测试文件或工作目录路径。
- `release` 只发布已经验证且哈希未变化的 tarball；使用 `1adybug` 账号向 npm 官方 registry 发布 `public`、`latest`。发生部分失败时停止并记录结果，重试只处理未完成版本，不自动撤销已发布版本。
- 发布后重新从公共 registry 安装，核对 tarball 完整性、所有文件哈希和实际浏览器加载。记录在 `output/release.json` 与 `output/consumer-registry/report.json`。

安装字体包不会执行下载或生成脚本。生成命令不依赖其他应用仓库。

## 版权与许可

字体版权分别属于 Xiaomi Inc.、Huawei Device Co., Ltd.、Guangdong OPPO Mobile Telecommunications Corp., Ltd. 和 vivo Mobile Communication Co., Ltd.。各包保留原始厂商许可，MiSans 的完整许可为 PDF；生成产物仍按各自厂商许可标注，不统一改成 MIT 或 OFL。官方来源、字体版本与校验值见各包的 `sources.json`。

本仓库是独立维护的封装，不是上述厂商的官方 npm 项目。
