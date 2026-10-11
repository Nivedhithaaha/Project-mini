import { useEffect, useState } from "react";

async function api(path, options = {}) {
  const token = localStorage.getItem("exam-day-token");
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Something went wrong. Please try again.");
  }
  return response.status === 204 ? null : response.json();
}

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function Auth({ onSignIn }) {
  const [mode, setMode] = useState("register");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/otp/send", { method: "POST", body: JSON.stringify({ phone }) });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api("/api/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone, code, mode, name }),
      });
      localStorage.setItem("exam-day-token", result.token);
      onSignIn(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card">
      <span className="eyebrow">YOUR SEMESTER, IN HAND</span>
      <h1>Make room<br />to <em>focus.</em></h1>
      <p className="muted">One calm place for everything coming up.</p>
      <div className="mode-switch" role="group" aria-label="Account type">
        {["register", "login"].map((value) => (
          <button
            className={mode === value ? "mode active" : "mode"}
            key={value}
            onClick={() => { setMode(value); setSent(false); setError(""); }}
            type="button"
          >
            {value === "register" ? "Create account" : "Log in"}
          </button>
        ))}
      </div>
      {!sent ? (
        <form onSubmit={sendCode}>
          {mode === "register" && (
            <label>
              Your name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" minLength="2" maxLength="60" required />
            </label>
          )}
          <label>
            Phone number
            <input
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 555 123 4567"
              type="tel"
              required
            />
            <span className="hint">Include your country code</span>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary full" disabled={busy}>{busy ? "Sending…" : "Send me a code"} <span>→</span></button>
        </form>
      ) : (
        <form onSubmit={verifyCode}>
          <label>
            Six-digit code
            <input
              autoComplete="one-time-code"
              autoFocus
              inputMode="numeric"
              maxLength="6"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              pattern="\d{6}"
              placeholder="000000"
              required
              value={code}
            />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary full" disabled={busy}>{busy ? "Checking…" : "Verify & continue"} <span>→</span></button>
          <button className="text-button" onClick={() => setSent(false)} type="button">Use a different number</button>
        </form>
      )}
      <p className="privacy-note">A little structure goes a long way.</p>
    </section>
  );
}

function Schedule({ user, onSignOut }) {
  const [exams, setExams] = useState([]);
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadExams() {
    const result = await api("/api/exams");
    setExams(result.exams);
  }

  useEffect(() => {
    loadExams().catch((err) => setError(err.message));
  }, []);

  async function addExam(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/exams", {
        method: "POST",
        body: JSON.stringify({ subject, date, time, location }),
      });
      setSubject("");
      setDate("");
      setTime("");
      setLocation("");
      await loadExams();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeExam(id) {
    setError("");
    try {
      await api(`/api/exams/${id}`, { method: "DELETE" });
      setExams((current) => current.filter((exam) => exam.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Exam Day home"><span className="brand-mark">e.</span> exam day</a>
        <div className="account"><span>Good to see you, <strong>{user.name}</strong></span><button className="text-button" onClick={onSignOut}>Sign out</button></div>
      </header>
      <section className="welcome">
        <div>
          <span className="eyebrow">YOUR STUDY SPACE</span>
          <h1>The next big thing<br />is <em>one exam away.</em></h1>
        </div>
        <div className="exam-count"><strong>{exams.length.toString().padStart(2, "0")}</strong><span>on your calendar</span></div>
      </section>
      <div className="content-grid">
        <section className="list-panel">
          <div className="section-heading"><div><span className="eyebrow">KEEP YOUR EYE ON</span><h2>Upcoming exams</h2></div><span className="count-pill">{exams.length} total</span></div>
          {error && <p className="error" role="alert">{error}</p>}
          {exams.length ? (
            <div className="exam-list">
              {exams.map((exam, index) => (
                <article className="exam-row" key={exam.id}>
                  <div className="date-tile"><span>{formatDate(exam.date).split(",")[0]}</span><strong>{new Date(`${exam.date}T00:00:00`).getDate()}</strong></div>
                  <div className="exam-info"><h3>{exam.subject}</h3><p>{formatDate(exam.date)} <span>·</span> {exam.time}{exam.location && <> <span>·</span> {exam.location}</>}</p></div>
                  <span className={`subject-dot dot-${index % 4}`} aria-hidden="true"></span>
                  <button className="remove-button" onClick={() => removeExam(exam.id)} aria-label={`Remove ${exam.subject}`}>×</button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state"><span className="empty-icon">✳</span><h3>Your calendar is clear.</h3><p>Add your first exam and start making a plan.</p></div>
          )}
        </section>
        <aside className="add-panel">
          <span className="eyebrow">A DATE TO REMEMBER</span>
          <h2>Add an exam</h2>
          <p className="muted">Small steps, big-picture calm.</p>
          <form onSubmit={addExam}>
            <label>Subject<input required minLength="2" maxLength="60" placeholder="e.g. Modern history" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
            <div className="form-row">
              <label>Date<input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label>Time<input required type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
            </div>
            <label>Room <span className="optional">(optional)</span><input maxLength="80" placeholder="e.g. Hall B, room 204" value={location} onChange={(event) => setLocation(event.target.value)} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary full" disabled={busy}>{busy ? "Adding…" : "Add to my schedule"} <span>+</span></button>
          </form>
        </aside>
      </div>
      <footer className="footer"><span>Take it one subject at a time.</span><span>EXAM DAY <span className="footer-star">✳</span></span></footer>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);

  function signOut() {
    localStorage.removeItem("exam-day-token");
    setUser(null);
  }

  return user ? <Schedule user={user} onSignOut={signOut} /> : (
    <main className="auth-layout">
      <div className="auth-art">
        <a className="brand light" href="/"><span className="brand-mark">e.</span> exam day</a>
        <div className="art-note"><span>THE LONG VIEW</span><p>One page<br />at a time.</p><span className="note-line"></span><small>Built for your next bright idea.</small></div>
        <span className="art-doodle" aria-hidden="true">✳</span>
        <span className="art-caption">MAKE SPACE TO THINK</span>
      </div>
      <Auth onSignIn={setUser} />
    </main>
  );
}
