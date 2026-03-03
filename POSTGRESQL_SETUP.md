# PostgreSQL Installation Guide for Windows/WSL2

## 📋 Overview

You need PostgreSQL to run the Transporti backend. Here are your options:

### Option 1: Install on WSL2 (Ubuntu) - **RECOMMENDED**
- ✅ Better for development
- ✅ Faster performance
- ✅ More like production environment

### Option 2: Install on Windows
- ✅ GUI tools available
- ✅ Easier for beginners

---

## 🐧 Option 1: Install PostgreSQL on WSL2 (Ubuntu)

### Step 1: Update system packages

```bash
sudo apt update
sudo apt upgrade -y
```

### Step 2: Install PostgreSQL

```bash
sudo apt install postgresql postgresql-contrib -y
```

### Step 3: Start PostgreSQL service

```bash
sudo service postgresql start
```

### Step 4: Check status

```bash
sudo service postgresql status
```

You should see: `* postgresql is running`

### Step 5: Switch to postgres user

```bash
sudo -i -u postgres
```

### Step 6: Access PostgreSQL

```bash
psql
```

### Step 7: Set password for postgres user

```sql
ALTER USER postgres WITH PASSWORD 'password';
```

**⚠️ Important**: Replace `'password'` with a strong password!

### Step 8: Create the database

```sql
CREATE DATABASE transporti;
```

### Step 9: Verify database was created

```sql
\l
```

You should see `transporti` in the list.

### Step 10: Exit psql and postgres user

```sql
\q
```

```bash
exit
```

### Step 11: Update your .env file

In `/mnt/c/Users/chaar/OneDrive/Bureau/transporti-backend/.env`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD_HERE@localhost:5432/transporti?schema=public"
```

Replace `YOUR_PASSWORD_HERE` with the password you set in Step 7.

### Step 12: Run migrations

```bash
cd /mnt/c/Users/chaar/OneDrive/Bureau/transporti-backend
npm run prisma:migrate
```

---

## 🪟 Option 2: Install PostgreSQL on Windows

### Step 1: Download PostgreSQL

Go to: https://www.postgresql.org/download/windows/

Download the installer for Windows.

### Step 2: Run the installer

- Click Next through the wizard
- **Remember the password you set** for the postgres user
- Keep the default port: 5432
- Install pgAdmin 4 (useful GUI tool)

### Step 3: Open pgAdmin 4

Find it in your Start menu.

### Step 4: Connect to PostgreSQL

- Double-click "Servers" → "PostgreSQL"
- Enter the password you set during installation

### Step 5: Create database

- Right-click "Databases" → "Create" → "Database"
- Name: `transporti`
- Click Save

### Step 6: Update your .env file

In `C:\Users\chaar\OneDrive\Bureau\transporti-backend\.env`:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/transporti?schema=public"
```

### Step 7: Run migrations (in WSL)

```bash
cd /mnt/c/Users/chaar/OneDrive/Bureau/transporti-backend
npm run prisma:migrate
```

---

## 🧪 Test Your Setup

### Test 1: Check PostgreSQL connection

```bash
cd /mnt/c/Users/chaar/OneDrive/Bureau/transporti-backend
npx prisma studio
```

Should open browser at `http://localhost:5555` showing your database.

### Test 2: Start the backend server

```bash
npm run dev
```

Should see:
```
✅ Database connected successfully
🚀 Server is running on http://localhost:3000
```

### Test 3: Test the health endpoint

Open browser: `http://localhost:3000/health`

Should see:
```json
{
  "success": true,
  "message": "Transporti API is running! 🚚"
}
```

---

## 🔧 Common Issues

### Issue: "postgresql is not running"

**Fix:**
```bash
sudo service postgresql start
```

To make it start automatically:
```bash
sudo systemctl enable postgresql
```

### Issue: "password authentication failed"

**Fix:**
1. Check your password in `.env` matches PostgreSQL
2. Reset password:
```bash
sudo -u postgres psql
ALTER USER postgres WITH PASSWORD 'newpassword';
\q
```

### Issue: "database 'transporti' does not exist"

**Fix:**
```bash
sudo -u postgres psql
CREATE DATABASE transporti;
\q
```

### Issue: "Port 5432 already in use"

**Fix:**
```bash
# Find process using port 5432
sudo lsof -i :5432

# Kill the process
sudo kill -9 <PID>

# Restart PostgreSQL
sudo service postgresql restart
```

### Issue: "Cannot connect from WSL to Windows PostgreSQL"

**Fix:**
In Windows PostgreSQL config file (`C:\Program Files\PostgreSQL\14\data\postgresql.conf`):

Change:
```
listen_addresses = 'localhost'
```

To:
```
listen_addresses = '*'
```

Also edit `pg_hba.conf`:
```
host    all             all             0.0.0.0/0               md5
```

Restart PostgreSQL service in Windows.

---

## 📊 Useful Commands

### PostgreSQL Service Management (WSL)

```bash
# Start
sudo service postgresql start

# Stop
sudo service postgresql stop

# Restart
sudo service postgresql restart

# Status
sudo service postgresql status
```

### Database Management

```bash
# Access PostgreSQL
sudo -u postgres psql

# List databases
\l

# Connect to database
\c transporti

# List tables
\dt

# Describe table
\d users

# Exit
\q
```

### Prisma Commands

```bash
# Generate client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Open Prisma Studio (GUI)
npm run prisma:studio

# Reset database (⚠️ DELETES ALL DATA)
npx prisma migrate reset
```

---

## ✅ Quick Setup Summary

For most users (WSL2):

```bash
# 1. Install PostgreSQL
sudo apt update && sudo apt install postgresql postgresql-contrib -y

# 2. Start service
sudo service postgresql start

# 3. Set password and create database
sudo -u postgres psql
ALTER USER postgres WITH PASSWORD 'password';
CREATE DATABASE transporti;
\q

# 4. Update .env with your password
# DATABASE_URL="postgresql://postgres:password@localhost:5432/transporti?schema=public"

# 5. Run migrations
cd /mnt/c/Users/chaar/OneDrive/Bureau/transporti-backend
npm run prisma:migrate

# 6. Start backend
npm run dev
```

---

## 🎉 Success!

If you see:
```
✅ Database connected successfully
🚀 Server is running on http://localhost:3000
```

Your PostgreSQL setup is complete! 🎊

---

## 📞 Need Help?

Common issues:
1. Wrong password → Update `.env`
2. PostgreSQL not running → `sudo service postgresql start`
3. Database doesn't exist → `sudo -u postgres psql` → `CREATE DATABASE transporti;`

Test your setup:
- `npx prisma studio` - Should open GUI
- `http://localhost:3000/health` - Should return success
