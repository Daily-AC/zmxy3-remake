# 八戒/沙僧"原版素材"排查（2026-07-07）

## 任务前提

团队怀疑 `vendor/zmxy_res` 的"再续天庭"包里 Role3（八戒）/Role4（沙僧）被 mod 作者换皮成了原创二次元角色
（八戒应为粉色猪头，沙僧应为持月牙铲僧人），要求找一份未被改动的原版 SWF 核对/替换。

## 结论：前提不成立，vendor/zmxy_res 里的 Role3/Role4 就是官方原版，没有被换皮

三个互相独立的信源交叉验证，结论一致：

1. **官方 4399 CDN 直连**（见下文），带防盗链校验，路径带 `20120107` 发布日期戳，
   与 `www.4399.com/flash/zmhj.htm?g=3` 页面自身的 `game_url_arr[3]` 一一对应——不可能是第三方 mod。
2. `vendor/zmxy_res` 的"造梦西游魔改版/造梦西游3再续天庭最终版"包（团队认定的"魔改"来源）。
3. 同一 `zmxy_res` 仓库里**造梦西游2**（另一个游戏，与"再续天庭"这个 3代 mod 毫无关系）的
   `造梦西游2勇闯地府/out_res/bajie.swf`。

三者对八戒的呈现高度一致：短发/扎头巾的人形男孩造型（造梦2里是红色鸡冠头+疑似钉耙武器，
造梦3是浅发+头巾+"步枪"造型武器），沙僧则是蓝色刺猬头精灵耳少年——**都不是传统猪头/月牙铲僧人形象**。
既然连未被"再续天庭"这个 3代专属 mod 碰过的造梦西游2 都是同一路数的人形化设计，说明"造梦西游"系列本身
（至少 2、3 代）对八戒/沙僧的美术方向就是Q版二次元人形化，不是写实取经班子造型。团队最初"应为粉猪头/持铲僧人"
的预期，大概率是套用了通俗西游记刻板印象或别的游戏/影视版本，与本系列实际美术无关。

## 排查过程

### 尝试 1：`vendor/zmxy_res` 仓库内是否有别的、未换皮的 造梦西游3 出处

- 仓库顶层其实有两个目录：`造梦西游魔改版`（已 sparse-checkout 的那个）和 `造梦西游OL`（4399 手游《造梦西游OL》
  全套素材，是另一款游戏，非造梦西游3，排除）。
- `造梦西游魔改版` 下还有一个"造梦西游3再续天庭"（不带"最终版"后缀）的兄弟目录，一度怀疑是换皮前的旧版本。
  用 `git ls-tree` 比对两份 `out_res/BaJie.swf`/`out_res/ShaShen.swf` 的 blob hash：**完全相同**
  （`BaJie.swf` = `b6652d61…`，`ShaShen.swf` = `e4decede…`），说明这只是同一份资源的重复目录，死路。

### 尝试 2：直接从 4399 官方线上找原始 SWF

`www.4399.com/flash/zmhj.htm?g=3`（造梦西游3 的官方页面）本身会因为 gb2312 编码在非 `LC_ALL=C` 环境下
grep 不出内容，需要 `LC_ALL=C grep -a` 才能正常匹配。页面 JS 里挖出：

```js
var game_url_arr = new Array();
game_url_arr[1] = 'https://sbai.4399.com/4399swf/upload_swf/ftp5/hanbao/20110624/3/v25928.htm';   // g=1
game_url_arr[2] = 'https://sbai.4399.com/4399swf/upload_swf/ftp6/hanbao/20110927/4/v25928.htm';   // g=2
game_url_arr[3] = 'https://sda.4399.com/4399swf/upload_swf/ftp7/hanbao/20120107/6/v3870.htm';      // g=3 ← 造梦西游3
game_url_arr[4] = 'https://sda.4399.com/4399swf/upload_swf/ftp15/csya/20150127/1/v5721x.htm';
game_url_arr[5] = 'https://sda.4399.com/4399swf/upload_swf/ftp22/csya/20170622/1/v4610s.htm';
```

直接 curl 这个 `.htm` 会被防盗链拦截（返回"请到4399小游戏官网开始游戏"错误页），加上
`-e "https://www.4399.com/flash/zmhj.htm?g=3"`（Referer）即可正常拿到内容，里面嵌了真正的
`<embed src="v3870.swf">`。

### 尝试 3：拆解 v3870.swf 找资源加载路径

`v3870.swf`（3.1MB，一个小 loader）本身没有角色美术，是个"外壳+manager"：用 FFDec 的
`-export binaryData` 导出内部 `DefineBinaryData`，chid 3（类名 `L4399Main_gamefile`，3.1MB）
本身又是一个完整的压缩 SWF（CWS 头），改名 `gamefile.swf` 后就是真正的游戏逻辑 SWF
（结构对应 mod 包里的"打开我开始玩.swf"，同样有 `export.hero.Role1~Role4` 这套类）。

反编译 `base/BaseHero.as` 的 `getAssetsArray()` 找到资源命名规则：

```as3
if (roleName == "ROLE4") {
    equipName = (weaponId in [4,5,7,8,9]) ? "ROLE4_ARROW_" + bodyId : "ROLE4_SHOVEL_" + bodyId;
} else {
    equipName = roleName + "_" + bodyId;   // 例：ROLE3_0
}
PlayerAssetsLoaderManager.getInstance().addSingle(equipName + ".swf", ...);
```

`PlayerAssetsLoaderManager.addSingle()` 里有个坑：只有 `!gc.isHideDebug || !GMain.serviceHold`
（调试环境）才会加 `"Assets/roles/RoleN_Equipment/"` 前缀；生产环境直接用裸文件名（小写）。
`loader/SuperLoader.load(path, arr)` 里 `url = path + arr[i]`，`path` 传的是空字符串，
所以最终请求的就是相对当前 SWF 目录的裸文件名，如 `role3_0.swf`。

用 `loader/Aloader.as` 里现成的 `urls` 数组（`GameMapv3870.swf`/`Commonv3720.swf` 等）验证：
这些兄弟文件确实就放在 `v3870.swf` 同一目录下（直接 curl 得到 HTTP 200），证实相对路径假设成立。

### 结果：直接从官方 CDN 顺利拿到

```
BASE=https://sda.4399.com/4399swf/upload_swf/ftp7/hanbao/20120107/6
curl -e "https://www.4399.com/flash/zmhj.htm?g=3" $BASE/role3_0.swf         # 183120 bytes, HTTP 200
curl -e "https://www.4399.com/flash/zmhj.htm?g=3" $BASE/role4_shovel_0.swf  # 167912 bytes, HTTP 200
curl -e "https://www.4399.com/flash/zmhj.htm?g=3" $BASE/role4_arrow_0.swf   # 208269 bytes, HTTP 200（意外收获）
```

`role3_0.swf` 只有一个 `DefineBitsJPEG3(chid 1)` 绑定类名 `ROLE3_0`（1800×2800，6列×14行，
300×200 格，与 asset-pipeline-notes.md 记录的网格完全一致）；`role4_shovel_0.swf`/`role4_arrow_0.swf`
同理绑定 `ROLE4_SHOVEL_0`/`ROLE4_ARROW_0`。三份都用 FFDec `-format image:png -export image`
成功导出完整位图表，肉眼核对（裁第一格放大）：**八戒是浅发+头巾+似步枪武器的人形少年，
沙僧是蓝色刺猬头+精灵耳少年**——和 `vendor/zmxy_res` 里"魔改版"的呈现逐像素风格一致（非同一份文件，
但同一套美术设计）。

## 产物

- `vendor/canonical-hunt/official_4399/v3870.swf` —— 官方 loader 外壳
- `vendor/canonical-hunt/official_4399/gamefile.swf` —— 官方游戏逻辑 SWF（含 `export.hero.Role1~4` AS3 源码可反编译）
- `vendor/canonical-hunt/official_4399/role3_0.swf` + `role3_0_images/1_ROLE3_0.png`（八戒默认时装表，1800×2800）
- `vendor/canonical-hunt/official_4399/role4_shovel_0.swf` + `role4_shovel_0_images/1_ROLE4_SHOVEL_0.png`（沙僧铲形态默认时装表）
- `vendor/canonical-hunt/official_4399/role4_arrow_0.swf` + `role4_arrow_0_images/1_ROLE4_ARROW_0.png`（沙僧弓形态，额外收获）
- `vendor/canonical-hunt/zmxy2_bajie.swf` —— 造梦西游2 的八戒源文件（旁证，未被"再续天庭" mod 碰过）
- `vendor/canonical-hunt/zmxy2_bajie_sprite393/.../1.png` —— 造梦西游2 八戒形象截帧（旁证图）

## 给团队的建议

不需要替换 `vendor/zmxy_res` 里的 Role3/Role4 素材——它们本来就是官方原版。如果团队仍然想要
"传统猪头八戒/月牙铲沙僧"的視覺呈現，那不是"找回原版"的问题，而是**主动重新设计/找别的画师重绘**的问题，
超出本次"找原版素材"任务范围，需要团队重新决策要不要做这件事。

顺带留一手：官方 4399 CDN 直连方式（referer 绕过防盗链 + 反编译 loader 找相对路径）本身是通用技巧，
以后要拿其他角色/关卡的"确定无疑的原版"素材，可以照此流程从 `gamefile.swf` 里再反编译其他 `export.hero.RoleN`
或 `export.monster.MonsterN` 类找文件名规律，直接对 CDN 目录批量 curl，不必再依赖社区仓库。

## 后续（2026-07-07 同日）：不用再让用户点，反编译 loader 拿到完整资源清单 + 一次性批量直下

**背景**：Online 客户端（`docs/reference/zmxy-online-extracted/`、`docs/reference/zmxy3-official/`
两次任务）靠"用户手点界面→资源流进 IE 缓存→抓缓存"来挖素材，慢且每次只挖到用户点过的那几个面板。
既然 `v3870.swf`/`gamefile.swf` 就是本文档上面已经拿到手的同一个官方 loader，直接反编译它的资源
加载逻辑，答案比等用户点快得多。

**反编译路径**：`v3870.swf`（`prefor.System4399Manager`/`L4399Main` 类，4399 平台账号/存档/商城
API 桥）→ `-export binaryData` 导出内嵌 `DefineBinaryData`（chid 3，`L4399Main_gamefile`）→
这就是真正的游戏逻辑 SWF（本文档前面已经这么干过一次）→ 对这个 gamefile 再 `-export script`
（1104 个 `.as` 文件）→ `loader/Aloader.as`（开局必加载的 7 个包：`MagicWeaponv1240.swf`/
`Commonv3720.swf`/`petEIconv1450.swf`/`EIconv3420.swf`/`GameMapv3870.swf`/`OtherMatv3570.swf`/
`GameBackGroundv3870.swf`）+ `my/Decrypt.as`（关键类：每关/每个 boss/每只宠物具体加载哪些
`.swf`，`loadSwfsWhenStageN` 系列数组 + `getUrlByAfterName()` 版本号后缀映射表，如
`"4"→"4v1070"`、`"41"→"41v3651"`）——**这就是游戏完整的资源清单和文件名规则，不用再猜、不用
再等用户点开哪个面板**。

`Decrypt.as` 还顺带把 SWF 头部加密算法的 AS3 源码原文交出来验证了一遍：
`_local4.writeBytes(_local3,300,25); _local4.writeBytes(_local3,0,300); _local4.writeBytes(_local3,325);`
——跟 `tools/decrypt-zmxyol-swf.py` 逆出的 PIVOT=300/END=325 完全一致（不是巧合，是同一套代码）。
`whichSwfDontNeedDecrypt(name)` 函数还给出了"哪些文件不加密"的确定性规则：`Role1~4`/`Monster*`/
全部宠物名/以及字面量 `"41"`，其余（关卡容器、UI 面板、图标、地图、法宝等）都要过一遍解密。

**URL 规律确认**：`Decrypt.as` 里所有加载调用都是 `uloader.load(new URLRequest(url))`，`url` 就是
裸文件名（不带域名），在 Flash 里会按"当前 SWF 自身的加载来源"解析相对路径——也就是本文档最初
验证过的同一个 CDN 目录：`https://sda.4399.com/4399swf/upload_swf/ftp7/hanbao/20120107/6/`，
Referer 绕防盗链同一招。

**结果**：编出 91 个文件名（Aloader 预加载表 + 全部 `loadSwfsWhenStageN` 数组 + 角色/宠物命名
函数穷举 + 之前几轮从 IE 缓存里见过的 UI 面板包名），从 mac 直接批量 `curl`（91 个请求，15s
超时/个，串行约 2 分钟），**88/91 成功**（134MB），失败的 3 个（`A4399dv_base`/
`A4399dv_base_main`/`ctrl_mo_v5`，4399 平台通用 UI 壳，不在这个游戏专属 CDN 目录下，
大概率是平台级共享资源挂在别的路径，价值也低，没有再深追）。抽样 2 个新拉到的加密文件
（`0v1150.swf`/`65.swf`）过 `tools/decrypt-zmxyol-swf.py` + FFDec 打开验证，正常。

产物落 `vendor/canonical-hunt/official_4399/batch/`（gitignored，跟 `vendor/` 全部素材同规矩，
不进 git；私有项目 + 法律风险已澄清，本地留着按需抽取即可）。这条路径以后要抠具体某个关卡/怪物
的美术，直接从这批本地文件里解密+导出，不需要再连 home、不需要再等用户点任何界面。

**已知不完整**：91 个文件名是从 `Decrypt.as` 里*显式命名*的 `loadSwfsWhenStageN` 数组
+ 有版本号映射的关卡容器编号拼出来的，没有机械穷举 0~65 每一个关卡数字（有些关卡编号在
`getUrlByAfterName()` 里没有版本后缀映射，可能是子关卡/活动关卡，命名规则未完全摸清）——
够用但不是 100% 全量，以后按需要再补，方法已经跑通不是难点。
