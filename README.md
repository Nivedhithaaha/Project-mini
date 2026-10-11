# Exam Day

A tiny exam schedule planner built with React, Vite, Express, and SQLite. Sign in with a phone OTP sent through Minimoth, then add and remove upcoming exams.

## Requirements

- Node.js 20 or newer and npm (the backend scripts automatically use Node.js 22 for SQLite)
- A Minimoth API key from [minimoth.dev](https://minimoth.dev)

## Run locally

1. In `backend`, copy `.env.example` to `.env`, add your Minimoth API key, then run:

   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. In a second terminal, in `frontend`, copy `.env.example` to `.env`, then run:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open the URL printed by Vite (usually `http://localhost:5173`). Enter your phone number in international format, including the country code.

The first backend start downloads the Node.js 22 runtime through `npx`; subsequent starts reuse it. The backend listens on port 4000 by default. Vite forwards `/api` requests to it; the Minimoth API key never goes to the browser. The SQLite database is created at `backend/exam-day.sqlite`.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/otp/send` | Send a Minimoth OTP |
| POST | `/api/auth/otp/verify` | Register or log in and receive a session |
| GET | `/api/exams` | List the signed-in user's exams |
| POST | `/api/exams` | Add an exam |
| DELETE | `/api/exams/:id` | Remove an exam |
