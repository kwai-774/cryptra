const socket = io();
let chatBox, chatButton, inputField, sendButton, messageContainer;

window.addEventListener("DOMContentLoaded", () => {
  // 建立聊天按鈕
  chatButton = document.createElement("button");
  chatButton.className = "chat-button";
  chatButton.innerHTML = "💬";
  document.body.appendChild(chatButton);

  // 聊天主體
  chatBox = document.createElement("div");
  chatBox.className = "chat-box";
  chatBox.innerHTML = `
    <div class="chat-header">Cryptra 客服</div>
    <div class="chat-messages" id="chatMessages"></div>
    <div class="chat-input">
      <input type="text" id="chatInput" placeholder="輸入訊息..." />
      <button id="sendChat">送出</button>
    </div>
  `;
  document.body.appendChild(chatBox);

  messageContainer = document.getElementById("chatMessages");
  inputField = document.getElementById("chatInput");
  sendButton = document.getElementById("sendChat");

  chatButton.addEventListener("click", () => {
    chatBox.style.display = chatBox.style.display === "flex" ? "none" : "flex";
  });

  sendButton.addEventListener("click", sendMessage);
  inputField.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });

  // 接收管理員訊息
  socket.on("adminMessage", (msg) => {
    appendMessage("admin", msg);
  });
});
  // 接收自己（訪客）的訊息，顯示在畫面上
  socket.on("userMessage", (data) => {
    appendMessage("user", `${data.name}：${data.message}`);
  });

function sendMessage() {
  const msg = inputField.value.trim();
  if (!msg) return;
  appendMessage("user", msg);
  socket.emit("userMessage", { name: "訪客", message: msg });
  inputField.value = "";
}

function appendMessage(sender, text) {
  const div = document.createElement("div");
  div.className = `chat-message ${sender}`;
  div.textContent = text;
  messageContainer.appendChild(div);
  messageContainer.scrollTop = messageContainer.scrollHeight;
}
// === 載入最新公告 ===
async function loadLatestAnnouncement() {
  try {
    const res = await fetch('/api/announcements');
    const announcements = await res.json();

    if (announcements.length > 0) {
      document.getElementById('announcement-text').textContent =
        "📢 " + announcements[0].title + " - " + announcements[0].content;
    } else {
      document.getElementById('announcement-text').textContent = "目前沒有公告。";
    }
  } catch (err) {
    console.error("公告載入錯誤:", err);
  }
}

// 頁面載入時自動執行
window.addEventListener('load', loadLatestAnnouncement);
