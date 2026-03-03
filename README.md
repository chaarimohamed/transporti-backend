# Transporti Backend API

Backend API for the Transporti mobile application built with Node.js, Express, PostgreSQL, and Prisma.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ (see installation guide below)

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Update the `.env` file with your database credentials:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/transporti?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-this"
```

### 3. Setup Database

Run Prisma migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## 📋 API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Request/Response Examples

#### Register (Sender)

```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "sender@test.com",
  "password": "password123",
  "firstName": "Ahmed",
  "lastName": "Ben Ali",
  "phone": "+216 98 765 432",
  "role": "sender"
}
```

#### Register (Carrier)

```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "carrier@test.com",
  "password": "password123",
  "firstName": "Sami",
  "lastName": "Trabelsi",
  "phone": "+216 20 123 456",
  "role": "carrier",
  "license": "TN-2024-12345",
  "matricule": "1234567A"
}
```

#### Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "sender@test.com",
  "password": "password123"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "sender@test.com",
      "firstName": "Ahmed",
      "lastName": "Ben Ali",
      "phone": "+216 98 765 432",
      "role": "SENDER",
      "createdAt": "2026-01-01T00:00:00.000Z"
    },
    "token": "jwt.token.here"
  }
}
```

## 🗄️ Database Schema

### Users Table
- id (UUID)
- email (unique)
- password (hashed)
- firstName, lastName, phone
- role (SENDER | CARRIER)
- license, matricule (carrier only)
- timestamps

### Shipments Table
- id (UUID)
- refNumber (unique, e.g., EXP-2938)
- from, to, cargo, price
- status (PENDING | IN_TRANSIT | DELIVERED | CANCELLED)
- senderId, carrierId (relations)
- timestamps

### Missions Table
- id (UUID)
- refNumber (unique, e.g., MISS-4521)
- from, to, cargo, price, date
- status (AVAILABLE | ASSIGNED | IN_PROGRESS | COMPLETED | CANCELLED)
- carrierId (optional)
- timestamps

## 🛠️ Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio (database GUI)

## 📊 Prisma Studio

View and edit your database with a GUI:

```bash
npm run prisma:studio
```

Opens at `http://localhost:5555`

## 🔒 Security Features

- ✅ Password hashing with bcrypt
- ✅ JWT authentication
- ✅ Role-based access control (SENDER/CARRIER)
- ✅ Protected routes
- ✅ CORS configuration
- ✅ Input validation
- ✅ SQL injection protection (Prisma ORM)

## 🌐 CORS Configuration

Update `ALLOWED_ORIGINS` in `.env` to match your mobile app:

```env
ALLOWED_ORIGINS="http://localhost:8081,exp://your-tunnel-url"
```

## 📦 Project Structure

```
src/
├── config/
│   └── database.ts        # Prisma client
├── controllers/
│   └── auth.controller.ts # Authentication logic
├── middleware/
│   ├── auth.ts            # JWT verification
│   └── errorHandler.ts    # Error handling
├── routes/
│   └── auth.routes.ts     # Auth endpoints
└── server.ts              # Express app
```

## 🐛 Troubleshooting

### Database Connection Issues

1. Ensure PostgreSQL is running:
   ```bash
   sudo service postgresql status
   ```

2. Check your `DATABASE_URL` in `.env`

3. Test connection:
   ```bash
   npm run prisma:studio
   ```

### Port Already in Use

Change the port in `.env`:
```env
PORT=3001
```

## 📝 Next Steps

1. Add shipment endpoints
2. Add mission endpoints
3. Add user profile update
4. Add file upload for documents
5. Add email notifications
6. Add push notifications

## 🤝 Contributing

This is a private project for the Transporti mobile app.

## 📄 License

ISC
