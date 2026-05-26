# 国内快速访问部署方案

Vercel 在国内访问经常不稳定。这个项目更建议部署到腾讯云 EdgeOne Pages，或者使用阿里云 OSS + CDN / 腾讯云 COS + CDN。

## 推荐方案：腾讯云 EdgeOne Pages

EdgeOne Pages 支持 Vite 项目、Git 仓库导入、环境变量、构建命令和输出目录配置。这个项目已经提供 `edgeone.json`：

```json
{
  "installCommand": "npm install",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "nodeVersion": "22.17.1"
}
```

### 操作步骤

1. 打开 EdgeOne Pages 控制台：

   https://edgeone.ai/products/pages

2. 新建 Pages 项目，选择导入 Git 仓库。

3. 选择你的 GitHub 仓库：

   `personal-blog`

4. 框架选择：

   `Vite`

5. 构建配置保持：

```text
Install Command: npm install
Build Command: npm run build
Output Directory: dist
Node Version: 22.17.1
```

6. 添加环境变量：

```env
VITE_SUPABASE_URL=你的 Supabase Project URL
VITE_SUPABASE_ANON_KEY=你的 Supabase anon public key
```

7. 点击部署。

8. 部署成功后，把 EdgeOne Pages 给你的域名复制下来。

9. 回到 Supabase 后台：

```text
Authentication -> URL Configuration
```

设置：

```text
Site URL: 你的 EdgeOne Pages 访问地址
Redirect URLs: 你的 EdgeOne Pages 访问地址/**
```

例如：

```text
Site URL: https://your-blog.edgeone.app
Redirect URLs: https://your-blog.edgeone.app/**
```

## 重要说明

如果你要让中国大陆访问真正稳定、快速，最好绑定一个已经备案的自定义域名，并开启国内 CDN/EdgeOne 加速。

如果没有备案域名，访问速度通常会比 Vercel 好一些，但仍然可能受跨境链路影响。

## 后端速度说明

当前后端仍然使用 Supabase。Supabase 服务不在中国大陆，因此：

- 首屏静态资源放到 EdgeOne 后会更快。
- 登录、读取日记、上传图片等 Supabase 请求，仍可能有跨境延迟。

如果你希望后端也在国内，下一步应把 Supabase 替换为：

- 腾讯云 CloudBase：云数据库 + 云存储 + 静态托管
- 阿里云 OSS + 表格存储/函数计算
- 腾讯云 COS + 云函数 + 数据库

## 备选方案：阿里云 OSS + CDN

适合有阿里云账号和备案域名的情况。

1. 本地构建：

```bash
npm.cmd run build
```

2. 把 `dist` 目录内容上传到 OSS Bucket。
3. 开启 OSS 静态网站托管。
4. 默认首页设置为：

```text
index.html
```

5. 404 页面也设置为：

```text
index.html
```

6. 绑定备案域名。
7. 开启 CDN 加速。

## 备选方案：腾讯云 COS + CDN

适合已经在腾讯云有备案域名的情况。

1. 本地构建：

```bash
npm.cmd run build
```

2. 把 `dist` 目录内容上传到 COS Bucket。
3. 开启静态网站。
4. 索引文档设置为：

```text
index.html
```

5. 绑定备案域名。
6. 配置 CDN 或 EdgeOne 加速。
