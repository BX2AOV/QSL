# 台灣節點（Android / Termux + Nginx）

把家裡的 Android 手機當成 `tw.bx2aov.top` 的節點：

- 靜態網站由手機直接供應
- `/rest`、`/auth`、`/storage`、`/functions` 由手機反向代理到 Supabase
- 用 `sub_filter` 把頁面裡的 Supabase 絕對網址改成本站相對路徑
  → 大陸使用者的瀏覽器只跟手機連線，不会直接連到美國 Supabase

```
大陸使用者 ──→ tw.bx2aov.top（台灣手機）
                    ├─ /            靜態檔案
                    ├─ /rest/       → Supabase
                    ├─ /auth/       → Supabase
                    ├─ /storage/    → Supabase（卡片圖）
                    └─ /functions/  → Supabase（LoTW / 寄信）
```

## 0. 前置

- 家裡是公共 IP（已確認）
- 路由器可以 port forward
- 手機（Samsung，已解 BL）安裝 **Termux（F-Droid 版）**
- Cloudflare 帳號（`bx2aov.top` 的 DNS）

## 1. 安裝

```bash
pkg update && pkg upgrade -y
pkg install -y nginx git curl openssl jq
termux-wake-lock
```

> 如果 `nginx -V` 沒有 `--with-http_sub_module`，改用「網站檔案內把 Supabase URL 換成空字串」的版本，跟我說我給你另一份設定。

## 2. 取得網站

```bash
cd ~
git clone https://github.com/BX2AOV/QSL.git site
```

## 3. 憑證（Cloudflare DNS-01，不需要開 80）

到 Cloudflare 建一組 API Token：`Zone → DNS → Edit`，限定 `bx2aov.top`。

```bash
curl https://get.acme.sh | sh
export CF_Token="你的 Cloudflare API Token"
~/.acme.sh/acme.sh --issue --dns dns_cf -d tw.bx2aov.top
mkdir -p ~/tw-node
~/.acme.sh/acme.sh --install-cert -d tw.bx2aov.top \
  --key-file ~/tw-node/key.pem \
  --fullchain-file ~/tw-node/cert.pem \
  --reloadcmd "nginx -s reload"
```

## 4. 啟動 Nginx

```bash
mkdir -p ~/tw-node
cp ~/site/tw-node/nginx.conf ~/tw-node/nginx.conf
nginx -c ~/tw-node/nginx.conf -t
nginx -c ~/tw-node/nginx.conf
```

## 5. 路由器

1. 路由器 DHCP 保留固定內網 IP 給手機（例如 192.168.1.50）
2. Port forwarding：
   - `80 → 手機:8080`
   - `443 → 手機:8443`

## 6. DNS

Cloudflare DNS 新增：

| 類型 | 名稱 | 內容 | Proxy |
| --- | --- | --- | --- |
| A | `tw` | 你家公共 IP | **DNS only（灰色雲）** |

> 一定要灰色雲，走 Cloudflare 代理就失去台灣節點的意義。

## 7. DDNS（IP 變了自動更新）

```bash
export CF_TOKEN="你的 Cloudflare API Token"
bash ~/site/tw-node/ddns-cloudflare.sh
```

放進背景每 5 分鐘跑：

```bash
nohup bash -c 'while true; do bash ~/site/tw-node/ddns-cloudflare.sh; sleep 300; done' > ~/ddns.log 2>&1 &
```

## 8. 測試

- 電腦：`curl -I https://tw.bx2aov.top`
- 大陸朋友：開 `https://tw.bx2aov.top`，測首頁、查詢、送出申請
- 晚上 9 點再測一次延遲與掉包

## 注意

- 手機 24 小時插電：注意電池膨脹與過熱，最好用智慧插座定時或拆電池
- Android 可能殺掉 Termux：關閉電池最佳化、開 wake lock
- 停電／斷網就整站消失；重要時期建議同時保留 Cloudflare Pages 主站
- 只開 80/443，其餘埠不要 forward
