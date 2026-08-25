const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./discordia.db');

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS users (username TEXT UNIQUE, password TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS messages (user TEXT, text TEXT)");
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], function(err) {
    if (err) return res.status(400).json({ erro: 'Usuário já existe!' });
    res.status(201).json({ mensagem: 'Criado com sucesso!' });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (row) res.status(200).json({ mensagem: 'Login aprovado!' });
    else res.status(401).json({ erro: 'Usuário ou senha incorretos!' });
  });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } }); // Liberado para facilitar testes

io.on('connection', (socket) => {
  // Histórico e Mensagens
  db.all("SELECT user, text FROM messages", [], (err, rows) => {
    socket.emit('historico_mensagens', rows);
  });

  socket.on('enviar_mensagem', (mensagem) => {
    db.run("INSERT INTO messages (user, text) VALUES (?, ?)", [mensagem.user, mensagem.text]);
    io.emit('receber_mensagem', mensagem);
  });

  // ==========================================
  // SINALIZAÇÃO WEBRTC (Para o Vídeo P2P)
  // ==========================================
  socket.on('entrar_voz', () => {
    socket.broadcast.emit('usuario_entrou_voz', socket.id);
  });

  socket.on('enviar_oferta', (data) => {
    socket.to(data.alvo).emit('receber_oferta', { oferta: data.oferta, remetente: socket.id });
  });

  socket.on('enviar_resposta', (data) => {
    socket.to(data.alvo).emit('receber_resposta', { resposta: data.resposta, remetente: socket.id });
  });

  socket.on('enviar_candidato_ice', (data) => {
    socket.to(data.alvo).emit('receber_candidato_ice', { candidato: data.candidato, remetente: socket.id });
  });
});

// ==========================================
// CONFIGURAÇÃO DA PORTA PARA O RENDER
// ==========================================
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT} com WebRTC!`);
});