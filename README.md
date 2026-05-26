# 风过留声 | Personal Blog

一个可以线上部署的个人博客和日记项目。界面简洁，支持写日记、上传封面图片、搜索、排序、明暗主题、导出和导入备份。配置 Supabase 后会自动切换到云端模式，文章和图片保存到 Supabase。

## 功能

- 写日记：标题、心情、正文、封面图片、公开开关
- 图片上传：本地模式保存到 IndexedDB，云端模式上传到 Supabase Storage
- 云端后端：Supabase Auth、Postgres、Storage
- 访客阅读：访客可以阅读公开日记
- 管理员写作：只有加入 `app_admins` 的账号可以发布、上传和删除
- 归档管理：搜索、排序、删除
- 本地兜底：没有配置 Supabase 时自动使用浏览器本地存储

## 本地运行

```bash
npm install
npm run dev
```

如果 Windows PowerShell 禁止运行 `npm.ps1`，可以使用：

```bash
npm.cmd install
npm.cmd run dev
```

## 接入 Supabase 云后端

1. 在 Supabase 创建项目。
2. 打开 Supabase SQL Editor，执行 `supabase/schema.sql`。
3. 在 Authentication 里启用 Email 登录。
4. 复制环境变量文件：

```bash
copy .env.example .env.local
```

5. 填入 Supabase 项目的 URL 和 anon key：

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

6. 启动项目，点击“登录”，用你的邮箱登录一次。
7. 回到 Supabase SQL Editor，查询用户 id：

```sql
select id, email from auth.users order by created_at desc;
```

8. 把你的账号加入管理员表：

```sql
insert into public.app_admins (user_id) values ('YOUR_USER_ID');
```

完成后，文章和图片会保存到 Supabase。访客只能阅读公开日记，管理员可以发布和删除。

## 构建部署

```bash
npm run build
```

构建产物会生成在 `dist` 目录。

### Vercel

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables: `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`

## 本地模式

如果没有配置 Supabase 环境变量，项目会自动使用浏览器 IndexedDB 本地模式，适合离线写作和开发预览。
