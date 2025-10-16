const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

// ===== 資料檔案路徑 =====
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');
const ANNOUNCEMENTS_FILE = path.join(__dirname, 'data', 'announcements.json');

// ===== 基本設定 =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'cryptra-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 } // 1 小時
}));

// ====== 工具函式 ======
function readData(file) {
  if (!fs.existsSync(file)) return [];
  const data = fs.readFileSync(file, "utf-8");
  return data ? JSON.parse(data) : [];
}
function writeData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

// ====== 首頁 ======
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====== 註冊 ======
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  let users = [];
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE));
  }
  if (users.find(u => u.username === username)) {
    return res.send('帳號已存在，請 <a href="/register.html">重新註冊</a>');
  }
  users.push({ username, password });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  res.send('註冊成功，請 <a href="/login.html">登入</a>');
});

// ====== 登入 ======
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.send('帳號或密碼錯誤，請 <a href="/login.html">重新登入</a>');
  }
  req.session.username = username;
  res.redirect('/dashboard');
});
app.get('/dashboard', (req, res) => {
  if (!req.session.username) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ====== 後台登入驗證 ======
function checkAdminLogin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.redirect('/login.html');
  }
}
app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === "admin" && password === "1234") {
    req.session.isAdmin = true;
    res.redirect('/admin.html');
  } else {
    res.send("<h3>登入失敗，請檢查帳號密碼</h3><a href='/login.html'>返回登入</a>");
  }
});
app.get('/admin.html', checkAdminLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/session-user', (req, res) => {
  res.json({ username: req.session.username || null });
});
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// ====== 公告 API ======
// 取得所有公告
app.get("/api/announcements", (req, res) => {
  const announcements = readData(ANNOUNCEMENTS_FILE);
  res.json(announcements);
});
// 新增公告
app.post("/api/announcements", (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ message: "標題與內容為必填" });
  const announcements = readData(ANNOUNCEMENTS_FILE);
  const newAnnouncement = { id: Date.now(), title, content, date: new Date().toISOString() };
  announcements.push(newAnnouncement);
  writeData(ANNOUNCEMENTS_FILE, announcements);
  res.status(201).json(newAnnouncement);
});
// 更新公告
app.put("/api/announcements/:id", (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  let announcements = readData(ANNOUNCEMENTS_FILE);
  const index = announcements.findIndex(a => a.id === parseInt(id));
  if (index === -1) return res.status(404).json({ message: "找不到公告" });
  announcements[index] = { ...announcements[index], title, content };
  writeData(ANNOUNCEMENTS_FILE, announcements);
  res.json(announcements[index]);
});
// 刪除公告
app.delete("/api/announcements/:id", (req, res) => {
  const { id } = req.params;
  let announcements = readData(ANNOUNCEMENTS_FILE);
  const updated = announcements.filter(a => a.id !== parseInt(id));
  if (updated.length === announcements.length) return res.status(404).json({ message: "找不到公告" });
  writeData(ANNOUNCEMENTS_FILE, updated);
  res.json({ message: "公告已刪除" });
});

// ====== Socket.io 即時客服 ======
io.on("connection", (socket) => {
  console.log("🟢 使用者連線");

  socket.on("userMessage", (msg) => {
    io.emit("userMessage", msg);
    saveMessage("user", msg);
  });

  socket.on("adminMessage", (msg) => {
    io.emit("adminMessage", msg);
    saveMessage("admin", msg);
  });

  socket.on("disconnect", () => {
    console.log("🔴 使用者離線");
  });
});
function saveMessage(sender, text) {
  const messages = fs.existsSync(MESSAGES_FILE)
    ? JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf-8"))
    : [];
  messages.push({ sender, text, time: new Date().toISOString() });
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

// ====== 啟動伺服器 ======
server.listen(PORT, () => {
  console.log(`✅ Cryptra 伺服器運行於 http://localhost:${PORT}`);
});
