import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

const SUBMISSIONS_FILE = path.join(process.cwd(), "submissions.json");

// Helper to read submissions
function readSubmissions() {
  try {
    if (fs.existsSync(SUBMISSIONS_FILE)) {
      const data = fs.readFileSync(SUBMISSIONS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading submissions file:", error);
  }
  return [];
}

// Helper to write submissions
function writeSubmissions(submissions: any) {
  try {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing submissions file:", error);
  }
}

// API Routes
app.get("/api/submissions", (req, res) => {
  const submissions = readSubmissions();
  res.json({ submissions });
});

app.post("/api/submissions", (req, res) => {
  const { name, email, campus, item, size } = req.body;

  if (!name || !email || !campus || !item || !size) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const submissions = readSubmissions();
  const newSubmission = {
    id: "sub_" + Math.random().toString(36).substr(2, 9),
    name,
    email,
    campus,
    item,
    size,
    timestamp: new Date().toISOString()
  };

  submissions.push(newSubmission);
  writeSubmissions(submissions);

  res.status(201).json({ success: true, submission: newSubmission });
});

app.delete("/api/submissions/:id", (req, res) => {
  const { id } = req.params;
  let submissions = readSubmissions();
  const initialLen = submissions.length;
  submissions = submissions.filter((s: any) => s.id !== id);

  if (submissions.length === initialLen) {
    return res.status(404).json({ error: "Submission not found" });
  }

  writeSubmissions(submissions);
  res.json({ success: true });
});

app.delete("/api/submissions", (req, res) => {
  writeSubmissions([]);
  res.json({ success: true });
});

// Dev/Production server integrations
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
