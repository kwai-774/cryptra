const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

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

// ===== 工具函式 =====
function readData(file) {
  if (!fs.existsSync(file)) return [];
  const data = fs.readFileSync(file, "utf-8");
  return data ? JSON.parse(data) : [];
}
function writeData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

// ===== 首頁 =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== 註冊 =====
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  let users = readData(USERS_FILE);
  if (users.find(u => u.username === username)) {
    return res.send('帳號已存在，請 <a href="/register.html">重新註冊</a>');
  }
  users.push({ username, password });
  writeData(USERS_FILE, users);
  res.send('註冊成功，請 <a href="/login.html">登入</a>');
});

// ===== 登入 =====
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = readData(USERS_FILE);
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

// ===== 管理員登入頁 =====
app.get('/admin', (req, res) => {
  res.send(`
    <html>
      <head><title>Admin Login</title></head>
      <body style="font-family:sans-serif; padding:30px;">
        <h2>🔒 管理員登入</h2>
        <form method="POST" action="/admin/login">
          <label>帳號：</label><br>
          <input name="username" /><br><br>
          <label>密碼：</label><br>
          <input type="password" name="password" /><br><br>
          <button type="submit">登入</button>
        </form>
      </body>
    </html>
  `);
});

app.post('/admin/login', express.urlencoded({ extended: true }), (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '1234') {
    req.session.isAdmin = true;
    res.redirect('/admin/dashboard');
  } else {
    res.send('❌ 登入失敗，請檢查帳號或密碼');
  }
});

// ===== 後台主頁（查看＆回覆訪客訊息） =====
app.get('/admin/dashboard', (req, res) => {
  if (!req.session.isAdmin) {
    return res.redirect('/admin');
  }

  const messages = readData(MESSAGES_FILE);

  let html = `
    <html>
      <head>
        <title>管理後台 - 訪客訊息</title>
        <script src="/socket.io/socket.io.js"></script>
      </head>
      <body style="font-family:sans-serif; padding:20px;">
        <h2>💬 訪客訊息管理面板</h2>
        <div id="messages" style="border:1px solid #ccc; padding:10px; height:300px; overflow-y:scroll;">
  `;

  messages.forEach(msg => {
    const color = msg.sender === 'admin' ? 'blue' : 'black';
    html += `<p><b style="color:${color}">${msg.sender}：</b> ${msg.text} <small>(${new Date(msg.time).toLocaleString()})</small></p>`;
  });

  html += `
        </div>
        <br>
        <form id="replyForm">
          <input id="replyInput" placeholder="輸入回覆訊息..." style="width:80%; padding:8px;" />
          <button type="submit">回覆</button>
        </form>

        <script>
          const socket = io();

          socket.on('userMessage', msg => {
            const div = document.getElementById('messages');
            div.innerHTML += '<p><b>訪客：</b>' + msg + '</p>';
            div.scrollTop = div.scrollHeight;
          });

          socket.on('adminMessage', msg => {
            const div = document.getElementById('messages');
            div.innerHTML += '<p style="color:blue"><b>管理員：</b>' + msg + '</p>';
            div.scrollTop = div.scrollHeight;
          });

          document.getElementById('replyForm').addEventListener('submit', e => {
            e.preventDefault();
            const msg = document.getElementById('replyInput').value;
            if (!msg) return;
            socket.emit('adminMessage', msg);
            document.getElementById('replyInput').value = '';
          });
        </script>
      </body>
    </html>
  `;

  res.send(html);
});

// ===== 公告 API =====
app.get("/api/announcements", (req, res) => {
  const announcements = readData(ANNOUNCEMENTS_FILE);
  res.json(announcements);
});
app.post("/api/announcements", (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ message: "標題與內容為必填" });
  const announcements = readData(ANNOUNCEMENTS_FILE);
  const newAnnouncement = { id: Date.now(), title, content, date: new Date().toISOString() };
  announcements.push(newAnnouncement);
  writeData(ANNOUNCEMENTS_FILE, announcements);
  res.status(201).json(newAnnouncement);
});
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
app.delete("/api/announcements/:id", (req, res) => {
  const { id } = req.params;
  let announcements = readData(ANNOUNCEMENTS_FILE);
  const updated = announcements.filter(a => a.id !== parseInt(id));
  if (updated.length === announcements.length) return res.status(404).json({ message: "找不到公告" });
  writeData(ANNOUNCEMENTS_FILE, updated);
  res.json({ message: "公告已刪除" });
});

// ===== Socket.io 即時客服 =====
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
  const messages = readData(MESSAGES_FILE);
  messages.push({ sender, text, time: new Date().toISOString() });
  writeData(MESSAGES_FILE, messages);
}

// ===== 啟動伺服器 =====
server.listen(PORT, () => {
  console.log(`✅ Cryptra 伺服器運行於 http://localhost:${PORT}`);
});
