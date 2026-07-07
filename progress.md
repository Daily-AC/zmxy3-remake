# progress

## 2026-07-07 立项 + 上游调研（session 1）

- 拍板：造梦西游3、素材提取重写路线、Phaser3+TS+Vite、Tauri 桌面包、agent NPC 先对话层后炼器、kagami 只参考不 fork、暂不联系其作者。
- 调研结论落盘 docs/research/upstream-survey.md（两个 Phaser 重制项目深评 + 素材链路）。
- 关键发现：vendor/zmxy_res 里有再续天庭 0.72 完整客户端和**已解密**全套 SWF（out_res/），"找本体+解密"两步免了。
- 进行中：项目骨架 ✅；Java/FFDec 安装、zmxy_res sparse clone、game/ 脚手架 → 见下次记录。

### 下一步
- [ ] FFDec CLI 跑通，从 out_res 导出悟空（Role1）动画帧
- [ ] 帧 → spritesheet 打包脚本（tools/）
- [ ] game/ 最小 Phaser 页播放悟空 walk/attack（里程碑 1 判据）
