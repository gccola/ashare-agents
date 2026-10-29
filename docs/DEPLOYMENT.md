# 服务器部署指南

## 端口规划

| 服务 | 默认端口 | 建议访问范围 | 说明 |
| --- | --- | --- | --- |
| 用户端 | `8787` | 公网或内网用户 | 行情、分析、公开 API 与用户网页 |
| 管理端 | `8788` | 仅管理员 / 内网 | Agent、模型、数据源与权重配置 |

开发模式还会启动两个 Vite 端口：用户端 `5173`、管理端 `5174`。生产部署只需要 `8787` 和 `8788`。

## 1. 直接部署

服务器安装 Node.js 22、pnpm 和 PM2：

```bash
node --version
pnpm --version
npm install -g pm2
```

上传项目后：

```bash
cd /path/to/a-share-multi-agent-analyst
cp .env.example .env
pnpm install --frozen-lockfile
pnpm build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

`.env` 生产示例：

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=8787
ADMIN_HOST=0.0.0.0
ADMIN_PORT=8788
ADMIN_TOKEN=请替换为至少32位强随机字符串
AGENT1_API_KEY=...
AGENT2_API_KEY=...
AGENT3_API_KEY=...
AGENT4_API_KEY=...
```

生成管理令牌示例：

```bash
openssl rand -hex 32
```

访问：

- 用户端：`http://服务器IP:8787`
- 管理端：`http://服务器IP:8788`

进入管理端后，展开需要配置的 Agent，填写供应商、模型和 Base URL，在“模型 API Key”区域输入密钥并先点击“测试连接”。页面会验证模型的结构化 JSON 输出，并显示耗时或具体错误；确认通过后再点击“保存密钥”，最后保存整体配置。测试不会写入密钥或修改已有配置。

## 2. Docker 部署

```bash
cp .env.example .env
# 编辑 .env，必须设置 ADMIN_TOKEN
docker compose up -d --build
docker compose logs -f
```

配置目录通过 volume 挂载到宿主机 `server/config/`，容器重建后配置仍会保留。保存配置时服务端会自动生成 `agents.json.bak`。

## 3. Nginx 反向代理

建议用户端使用公网域名，管理端使用单独域名并限制来源 IP。

```nginx
server {
    listen 80;
    server_name stock.example.com;
    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /api/analysis/stream {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 180s;
    }
}

server {
    listen 80;
    server_name admin-stock.example.com;
    allow 10.0.0.0/8;
    deny all;
    location / {
        proxy_pass http://127.0.0.1:8788;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

生产环境应使用 HTTPS，并限制 `8788` 端口仅对可信 IP 开放。

## 4. 防火墙

Ubuntu 示例：

```bash
sudo ufw allow 8787/tcp
sudo ufw allow from 你的管理IP to any port 8788 proto tcp
sudo ufw enable
```

不要直接向全网开放 `8788`。如果没有配置 `ADMIN_TOKEN`，管理服务只允许本机回环地址访问。

## 5. 健康检查与升级

```bash
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8788/api/health
```

升级：

```bash
git pull
pnpm install --frozen-lockfile
pnpm build
pm2 restart a-share-analyst
```

Docker 升级：

```bash
docker compose up -d --build
```

## 6. 运行注意事项

- 当前行情缓存位于进程内存；单实例运行即可。不要使用 PM2 cluster 多实例，否则会重复抓取且缓存不共享。
- 若需要多实例，应先将缓存迁移到 Redis，并确保管理配置由数据库或共享文件统一提供。
- 公开行情源可能变化，生产环境应监控数据源失败率和交叉校验质量分。
- 管理配置保存后立即生效，无需重启；修改 `.env` 中的 API Key 后需要重启服务。
- 管理端直接填写的 API Key 保存在 `server/config/secrets.json`，部署时请确保 `server/config/` 目录持久化并限制文件权限。
- 镜像构建会排除 `server/config/secrets.json` 和配置文件备份；生产密钥应通过环境变量或首次启动后的管理端录入。
