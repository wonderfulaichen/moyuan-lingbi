# 创建 Tauri Mobile 项目

## 项目信息

- **项目名称：** moyuan-lingbi-mobile
- **保存位置：** D:\Projects\moyuan-lingbi-mobile
- **技术栈：** React + TypeScript + Vite

---

## 创建步骤

### 1. 创建项目目录

```bash
D:\Projects\moyuan-lingbi-mobile
```

### 2. 创建 React 项目

```bash
npm create vite@latest . -- --template react-ts
```

### 3. 添加 Tauri

```bash
npx tauri init --app-name "墨渊灵笔" --window-title "墨渊灵笔" --dev-url http://localhost:5173 --before-dev-command "npm run dev" --before-build-command "npm run build" --ci
```

### 4. 添加移动端支持

```bash
npx tauri add android
```

### 5. 构建 APK

```bash
npx tauri build --target android
```

---

## 环境变量配置

### Rust
```bash
RUSTUP_HOME=D:\RUST\.rustup
CARGO_HOME=D:\RUST\.cargo
PATH=D:\RUST\.cargo\bin;%PATH%
```

### Node.js
```bash
PATH=D:\nodejs;%PATH%
```

---

## Android SDK

确保环境变量设置：
```bash
ANDROID_HOME=D:\Android\Sdk
PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%PATH%
```
