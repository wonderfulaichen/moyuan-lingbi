# 第三方开源软件许可证声明

本项目（墨渊灵笔）使用了以下第三方开源软件。本文档列出了所有直接依赖及其许可证信息。

> 本项目的完整许可证见 [LICENSE](./LICENSE) 文件（MIT 许可证）。

---

## 生产依赖 (Dependencies)

### React
- **包名**: react, react-dom
- **版本**: ^18.3.1
- **许可证**: MIT
- **版权**: Copyright (c) Facebook, Inc. and its affiliates.
- **仓库**: https://github.com/facebook/react
- **许可证文件**: node_modules/react/LICENSE

### Tailwind CSS
- **包名**: tailwindcss, @tailwindcss/vite, @tailwindcss/postcss
- **版本**: ^4.1.18
- **许可证**: MIT
- **版权**: Copyright (c) Tailwind Labs, Inc.
- **仓库**: https://github.com/tailwindlabs/tailwindcss
- **许可证文件**: node_modules/tailwindcss/LICENSE

### Zustand
- **包名**: zustand
- **版本**: ^5.0.12
- **许可证**: MIT
- **版权**: Copyright (c) 2019 Paul Henschel
- **仓库**: https://github.com/pmndrs/zustand
- **许可证文件**: node_modules/zustand/LICENSE

### Capacitor
- **包名**: @capacitor/core, @capacitor/android
- **版本**: ^8.3.1
- **许可证**: MIT
- **版权**: Copyright (c) 2017-present Drifty Co.
- **仓库**: https://github.com/ionic-team/capacitor
- **许可证文件**: node_modules/@capacitor/core/LICENSE

### Font Awesome
- **包名**: @fortawesome/fontawesome-free
- **版本**: ^7.2.0
- **许可证**: 混合许可证
  - **图标 (SVG/JS)**: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
  - **字体文件**: SIL OFL 1.1
  - **代码**: MIT
- **版权**: Copyright (c) 2026 Fonticons, Inc. (https://fontawesome.com)
- **仓库**: https://github.com/FortAwesome/Font-Awesome
- **许可证文件**: node_modules/@fortawesome/fontawesome-free/LICENSE.txt
- **说明**: 使用 Font Awesome Free 图标需遵守 CC BY 4.0 署名要求

### XYFlow (React Flow)
- **包名**: @xyflow/react
- **版本**: ^12.10.2
- **许可证**: MIT
- **版权**: Copyright (c) 2019-2025 webkid GmbH
- **仓库**: https://github.com/xyflow/xyflow
- **许可证文件**: node_modules/@xyflow/react/LICENSE

### node-llama-cpp
- **包名**: node-llama-cpp
- **版本**: ^3.18.1
- **许可证**: MIT
- **版权**: Copyright (c) 2023 Gilad S.
- **仓库**: https://github.com/withcatai/node-llama-cpp
- **许可证文件**: node_modules/node-llama-cpp/LICENSE

---

## 开发依赖 (DevDependencies)

### Vite
- **包名**: vite, @vitejs/plugin-react
- **版本**: ^6.4.1
- **许可证**: MIT
- **版权**: Copyright (c) 2019-present, VoidZero Inc. and Vite contributors
- **仓库**: https://github.com/vitejs/vite
- **许可证文件**: node_modules/vite/LICENSE.md

### TypeScript
- **包名**: typescript
- **版本**: ~5.8.3
- **许可证**: Apache-2.0
- **版权**: Copyright (c) Microsoft Corporation. All rights reserved.
- **仓库**: https://github.com/microsoft/TypeScript
- **许可证文件**: node_modules/typescript/LICENSE.txt

### Electron
- **包名**: electron, electron-builder
- **版本**: ^39.8.9, ^26.0.12
- **许可证**: MIT
- **版权**: Copyright (c) Electron contributors, Copyright (c) 2013-2020 GitHub Inc.
- **仓库**: https://github.com/electron/electron
- **许可证文件**: node_modules/electron/LICENSE

### Testing Library
- **包名**: @testing-library/react, @testing-library/jest-dom, @testing-library/user-event
- **版本**: ^16.3.2, ^6.9.1, ^14.6.1
- **许可证**: MIT
- **版权**: Copyright (c) 2017-Present Kent C. Dodds
- **仓库**: https://github.com/testing-library/react-testing-library
- **许可证文件**: node_modules/@testing-library/react/LICENSE

### Capacitor CLI
- **包名**: @capacitor/cli
- **版本**: ^8.3.1
- **许可证**: MIT
- **版权**: Copyright (c) 2017-present Drifty Co.
- **仓库**: https://github.com/ionic-team/capacitor

### 其他开发工具
- **concurrently** - MIT - https://github.com/open-cli-tools/concurrently
- **wait-on** - MIT - https://github.com/jeffbski/wait-on
- **jsdom** - MIT - https://github.com/jsdom/jsdom
- **vitest** - MIT - https://github.com/vitest-dev/vitest
- **autoprefixer** - MIT - https://github.com/postcss/autoprefixer
- **png-to-ico** - MIT - https://github.com/steambap/png-to-ico

---

## 许可证全文

### MIT 许可证

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache-2.0 许可证

详见各包目录下的 LICENSE 文件，或访问 https://www.apache.org/licenses/LICENSE-2.0

### CC BY 4.0 (Font Awesome 图标)

详见: https://creativecommons.org/licenses/by/4.0/

### SIL OFL 1.1 (Font Awesome 字体)

详见: https://scripts.sil.org/OFL

---

## 完整许可证文件位置

所有第三方依赖的完整许可证文件均可在 `node_modules/{包名}/` 目录下找到（如 LICENSE、LICENSE.txt、LICENSE.md 等）。

如需获取任何依赖的完整许可证文本，请查阅对应目录。

---

*本文档最后更新于 2026-05-15*
