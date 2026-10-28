# Educate Cloud backend

Express 5 and TypeScript API with a MySQL connection pool (`mysql2`). The server reads its configuration from environment variables and does not store database credentials in source files.

## Setup

1. Copy `.env.example` to `.env` and set your local MySQL connection details. Never commit `.env` or put production credentials in GitHub.
2. Install packages and start the development server:

```bash
npm install
npm run dev
```

The API listens on `http://localhost:4000` by default. For production, set `NODE_ENV=production`, `PORT`, `CORS_ORIGIN`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` in Hostinger's Node.js app environment settings. Hostinger MySQL connections from a Node.js app use `127.0.0.1`; enter the exact database and user names shown in hPanel. Production startup refuses to run with missing database credentials or CORS origin.

Database schema changes are not run automatically when the API starts. After taking a database backup and reviewing the migration, build the app and run `npm run db:migrate` once from the backend app directory. This creates the application tables and migrates legacy admin accounts/sessions into their separate tables; do not run it against live data until the backup and target database are confirmed.

## Routes

- `GET /` — API status.
- `GET /api/health` — process health.
- `GET /api/health/database` — checks that MySQL responds to a simple query.
- `POST /api/auth/register` — creates a student account.
- `POST /api/auth/login/student` — student sign-in.
- `POST /api/auth/login/staff` — teacher or admin sign-in.
- `GET /api/auth/me` — returns the signed-in account.
- `POST /api/auth/logout` — ends the current session.
- `GET /api/content?status=all&q=...` — search student learning content. Requires a teacher or admin session.
- `POST /api/content` — create a lesson/resource (teacher/admin only).
- `PUT /api/content/:id` — edit or publish/unpublish content (teacher/admin only).
- `DELETE /api/content/:id` — remove a content item (teacher/admin only).
- `GET /api/students?q=...&page=1` — search and page through registered student accounts (teacher/admin only; 25 per page).

Published content is stored for the student experience, which will be connected when the student dashboard is built.

Sign-in is rate-limited to 10 attempts per IP per 15 minutes, and registration is limited to 5 attempts per IP per hour. Student registration creates a student row in `users`. Teacher accounts remain in `users` and must be provisioned by an administrator. Promote a registered user to teacher with:

```sql
UPDATE users SET role = 'teacher' WHERE email = 'teacher@example.com';
```

Administrator credentials and profile fields, including `full_name`, are stored in `admins`; administrator sessions are stored separately in `admin_sessions`. The migration also removes the content-author foreign key to `users` and records the author's role alongside each content item so admin-created material remains valid.

## Build and run

```bash
npm run build
npm start
```

`npm start` runs the root `server.js` launcher, which loads the compiled application from `dist/server.js`. This also matches Hostinger's root-level entry-file setting. Node.js 24 is selected by `.nvmrc` and the `engines` field. Keep `.env` private and configure production credentials through the hosting provider's environment settings.

The GitHub Actions workflow at `.github/workflows/production.yml` checks that the backend compiles on Node.js 24. Hostinger remains responsible for deployment from the connected branch; this workflow does not upload code or run database migrations.
