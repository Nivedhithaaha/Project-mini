import { createHash, randomBytes } from "node:crypto";
import express from "express";
import { db } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const apiKey = process.env.MINIMOTH_API_KEY?.trim();
const minimothUrl = "https://api.minimoth.dev/v1/otp";
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

app.use(express.json({ limit: "10kb" }));

function normalizePhone(value) {
  if (typeof value !== "string") {
    return null;
  }
  const formatted = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+?[1-9]\d{7,14}$/.test(formatted)) return null;
  return formatted.replace(/^\+/, "");
}

function validDate(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

async function minimothRequest(action, body) {
  if (!apiKey || apiKey === "your_minimoth_api_key") {
    const error = new Error("Set MINIMOTH_API_KEY in backend/.env.");
    error.status = 503;
    throw error;
  }

  let response;
  try {
    response = await fetch(`${minimothUrl}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    const error = new Error("Could not reach the Minimoth service. Please try again.");
    error.status = 502;
    throw error;
  }

  let result = {};
  try {
    result = await response.json();
  } catch {
    if (response.ok) {
      const error = new Error("Minimoth returned an invalid response.");
      error.status = 502;
      throw error;
    }
  }
  if (!response.ok) {
    const message = result && typeof result === "object"
      ? [result.error, result.message].find((value) => typeof value === "string")
      : null;
    const error = new Error(message || "Minimoth could not complete the request.");
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    const error = new Error("Minimoth returned an invalid response.");
    error.status = 502;
    throw error;
  }
  return result;
}

function requireSession(req, res, next) {
  const token = req.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return res.status(401).json({ error: "Please sign in to continue." });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = db.prepare(`
    SELECT users.id, users.name
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, new Date().toISOString());

  if (!session) return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  req.user = session;
  next();
}

app.post("/api/auth/otp/send", async (req, res, next) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: "Enter a valid phone number with country code." });

  try {
    await minimothRequest("send", { phone });
    res.json({ message: "OTP sent." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/otp/verify", async (req, res, next) => {
  const phone = normalizePhone(req.body?.phone);
  const { code, mode, name } = req.body || {};
  if (!phone || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "Enter a valid phone number and six-digit code." });
  }
  if (mode !== "login" && mode !== "register") {
    return res.status(400).json({ error: "Choose login or registration." });
  }
  if (mode === "register" && (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 60)) {
    return res.status(400).json({ error: "Enter a name between 2 and 60 characters." });
  }

  const existingUser = db.prepare("SELECT id FROM users WHERE phone = ?").get(phone);
  if (mode === "register" && existingUser) {
    return res.status(409).json({ error: "An account already exists for this number. Please log in." });
  }
  if (mode === "login" && !existingUser) {
    return res.status(404).json({ error: "No account found for this number. Please register." });
  }

  try {
    await minimothRequest("verify", { phone, code });

    let userId;
    if (mode === "register") {
      const user = db.prepare("INSERT INTO users (phone, name) VALUES (?, ?)").run(phone, name.trim());
      userId = Number(user.lastInsertRowid);
    } else {
      userId = existingUser.id;
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString();
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash, userId, expiresAt);
    const user = db.prepare("SELECT name FROM users WHERE id = ?").get(userId);
    res.json({ token, user: { name: user.name } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/exams", requireSession, (req, res) => {
  const exams = db.prepare(`
    SELECT id, subject, exam_date AS date, start_time AS time, location
    FROM exams WHERE user_id = ?
    ORDER BY exam_date, start_time
  `).all(req.user.id);
  res.json({ exams });
});

app.post("/api/exams", requireSession, (req, res) => {
  const { subject, date, time, location = "" } = req.body || {};
  if (typeof subject !== "string" || subject.trim().length < 2 || subject.trim().length > 60) {
    return res.status(400).json({ error: "Subject must be between 2 and 60 characters." });
  }
  if (!validDate(date) || typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return res.status(400).json({ error: "Enter a valid exam date and time." });
  }
  if (typeof location !== "string" || location.trim().length > 80) {
    return res.status(400).json({ error: "Location must be 80 characters or fewer." });
  }

  const result = db.prepare(`
    INSERT INTO exams (user_id, subject, exam_date, start_time, location)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, subject.trim(), date, time, location.trim());
  res.status(201).json({
    exam: { id: Number(result.lastInsertRowid), subject: subject.trim(), date, time, location: location.trim() },
  });
});

app.delete("/api/exams/:id", requireSession, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid exam id." });
  const result = db.prepare("DELETE FROM exams WHERE id = ? AND user_id = ?").run(id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: "Exam not found." });
  res.status(204).end();
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : "Something went wrong. Please try again." });
});

app.listen(port, () => console.log(`Exam Day API listening on http://localhost:${port}`));
