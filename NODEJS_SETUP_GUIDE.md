# Node.js 环境配置指南

## Node.js 已成功复制到 D:\nodejs

```
版本: v24.13.0
npm: 11.6.2
大小: 496 MB
```

---

## 需要手动完成的步骤：

### 1. 修改 PATH 环境变量

**步骤：**

1. 按 `Win + X`，选择"系统"
2. 点击"高级系统设置"
3. 点击"环境变量"按钮
4. 在"系统变量"中找到 `Path`，双击编辑
5. **将 `C:\Program Files\nodejs` 修改为 `D:\nodejs`**
6. 点击"确定"保存

### 2. 验证配置

打开**新的** PowerShell 或 CMD，输入：
```bash
node --version
npm --version
```

应该显示：
- node v24.13.0
- npm 11.6.2

### 3. 测试项目

进入你的项目目录测试：
```bash
cd "D:\Users\qq274\Desktop\开发文件\ai小说项目开发\墨渊灵笔"
npm --version
```

---

## 如果遇到问题

**问题1：npm 命令找不到**
- 确保 PATH 中添加了 `D:\nodejs`
- 重启终端或电脑

**问题2：npm 全局包不工作**
- 可能需要重新安装全局包：
  ```bash
  npm install -g npm @vue/cli create-react-app
  ```

---

## 下一步

完成 PATH 配置后，告诉我，我会继续帮你：
1. 安装 Rust 到 D:\RUST
2. 创建 Tauri Mobile 项目
3. 构建 Android APK
