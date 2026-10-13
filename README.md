# NoticeHub — Smart Digital Notice Board

NoticeHub is a full-stack college notice board built with React, Express, and SQLite. The local database is created automatically on first backend start; MySQL can also be selected when you have a configured MySQL account.

Student feeds are personalized by department, year, and semester. Teachers and admins can target a notice to any combination of those fields. Notices with a deadline in the next seven days are highlighted, and admins see read and unread reach counts for each active notice.

## Requirements

- Node.js 22.13 or newer (Node 24 recommended)
- npm

## Start the project

Open two terminals from the project folder.

Terminal 1 — backend:

```powershell
cd server
npm install
npm run dev
```

Terminal 2 — frontend:

```powershell
cd client
npm install
npm run dev
```

Open <http://localhost:5173>. The API runs at <http://localhost:5000>; its database status is available at <http://localhost:5000/api/health>.

The default database is `server/noticehub.sqlite`. The backend creates the database and tables automatically. You do not need a separate database server for local development.

## Create an admin account

1. Register an account in NoticeHub.
2. In the backend terminal, run:

   ```powershell
   npm run make-admin -- your_email@example.com
   ```

3. Log out and log in again to receive the admin role.

## Teacher and student accounts

On the Register tab, choose **Teacher** or **Student**. Teachers can publish, edit, and delete notices; students can browse notices and mark them as read. Public registration cannot create admin accounts.

To switch an existing account to teacher, run `npm run make-teacher -- your_email@example.com` from the `server` folder, then log out and back in.

## Use MySQL instead

Set `DB_CLIENT=mysql` in `server/.env`, then set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. Create the database and tables with `database/schema.sql` before starting the backend. Existing MySQL databases are upgraded to support the teacher role when the backend starts. Without `DB_CLIENT=mysql`, the app uses its local SQLite database.

Set `JWT_SECRET` to a random value at least 32 characters long for production. The built-in development secret is only for local use. Keep `.env` and `server/noticehub.sqlite` private and out of public repositories.
