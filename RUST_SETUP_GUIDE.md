# Rust 环境配置指南

## Rust 已成功安装到 D:\RUST

```
版本: rustc 1.95.0
cargo: 1.95.0
安装位置: D:\RUST
工具链: stable-x86_64-pc-windows-msvc
```

---

## 需要手动完成的步骤：

### 1. 配置 Rust PATH 环境变量

**步骤：**

1. 按 `Win + X`，选择"系统"
2. 点击"高级系统设置"
3. 点击"环境变量"按钮
4. 在"系统变量"中，点击"新建"
5. 变量名：`RUSTUP_HOME`
6. 变量值：`D:\RUST\.rustup`
7. 点击"确定"

8. 再次点击"新建"
9. 变量名：`CARGO_HOME`
10. 变量值：`D:\RUST\.cargo`
11. 点击"确定"

12. 在"系统变量"中找到 `Path`，双击编辑
13. 新增：`D:\RUST\.cargo\bin`
14. 点击"确定"保存

### 2. 验证配置

打开**新的** PowerShell 或 CMD，输入：
```bash
rustc --version
cargo --version
```

应该显示：
- rustc 1.95.0
- cargo 1.95.0

---

## 下一步

完成 PATH 配置后，告诉我，我会继续帮你创建 Tauri Mobile 项目！
