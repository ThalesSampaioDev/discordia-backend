const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();

// 🔓 LIBERAÇÃO DO CORS (Essencial para o Netlify conversar com o Render)
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Permite conexões de Socket.io de qualquer frontend
    methods: ["GET", "POST"]
  }
});

// Configuração do Banco de Dados SQLite3
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Erro ao abrir o banco de dados', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite3.');
  }
});

// Criação das tabelas necessárias (Usuários e Mensagens)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    text TEXT
  )`);
});

// --- ROTAS HTTP (Login, Registro) ---

// Rota de Registro
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ erro: "Usuário e senha são obrigatórios." });
  }

  const query = `INSERT INTO users (username, password) VALUES (?, ?)`;
  db.run(query, [username, password], function(err) {
    if (err) {
      return res.status(400).json({ erro: "Usuário já existe ou erro no cadastro." });
    }
    res.status(201).json({ mensagem: "Usuário cadastrado com sucesso!" });
  });
});

// Rota de Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ erro: "Usuário e senha são obrigatórios." });
  }

  const query = `SELECT * FROM users WHERE username = ? AND password = ?`;
  db.get(query, [username, password], (err, row) => {
    if (err) {
      return res.status(500).json({ erro: "Erro interno no servidor." });
    }
    if (row) {
      res.json({ mensagem: "Login bem-sucedido!" });
    } else {
      res.status(401).json({ erro: "Usuário ou senha incorretos." });
    }
  });
});

// --- WEBSOCKETS (Chat e WebRTC / Voz) ---
io.on('connection', (socket) => {
  console.log(`Usuário conectado: ${socket.id}`);

  // Envia o histórico de mensagens assim que o usuário entra
  db.all(`SELECT user, text FROM messages`, [], (err, rows) => {
    if (!err) {
      socket.emit('historico_mensagens', rows);
    }
  });

  // Recebe e salva novas mensagens de texto
  socket.on('enviar_mensagem', (data) => {
    const { user, text } = data;
    db.run(`INSERT INTO messages (user, text) VALUES (?, ?)`, [user, text], (err) => {
      if (!err) {
        io.emit('receber_mensagem', { user, text });
      }
    });
  });

  // Sinalização WebRTC para Voz e Compartilhamento de Tela
  socket.on('entrar_voz', () => {
    socket.broadcast.emit('usuario_entrou_voz', socket.id);
  });

  socket.on('enviar_oferta', (data) => {
    io.to(data.alvo).emit('receber_oferta', {
      remetente: socket.id,
      oferta: data.oferta
    });
  });

  socket.on('enviar_resposta', (data) => {
    io.to(data.alvo).emit('receber_resposta', {
      remetente: socket.id,
      resposta: data.resposta
    });
  });

  socket.on('enviar_candidato_ice', (data) => {
    io.to(data.alvo).emit('receber_candidato_ice', {
      remetente: socket.id,
      candidato: data.candidato
    });
  });

  socket.on('disconnect', () => {
    console.log(`Usuário desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});