const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB 제한
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const sessions = {}; // { sessionId: { files: [], pin: '123456' } }

function generatePIN() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.get('/', async (req, res) => {
  const sessionId = uuidv4();
  const pin = generatePIN();
  const uploadURL = `${req.protocol}://${req.get('host')}/upload/${sessionId}`;
  const qr = await QRCode.toDataURL(uploadURL);

  sessions[sessionId] = { files: [], pin };
  res.render('qr', { sessionId, qr, pin });
});

app.get('/upload/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.get('/upload-pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pin-upload.html'));
});

app.post('/upload/:sessionId', upload.array('file'), (req, res) => {
  const { sessionId } = req.params;
  if (!sessions[sessionId]) return res.status(400).send('Invalid session');

  const uploadedFiles = req.files;
  sessions[sessionId].files.push(...uploadedFiles);
  io.to(sessionId).emit('file-uploaded', uploadedFiles);
  res.send('파일이 업로드되었습니다.');
});

app.post('/upload-by-pin', express.urlencoded({ extended: true }), (req, res) => {
  const { pin } = req.body;
  const sessionId = Object.keys(sessions).find(id => sessions[id].pin === pin);
  if (!sessionId) return res.status(400).send('PIN이 잘못되었습니다.');
  res.redirect(`/upload/${sessionId}`);
});

app.get('/session/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', socket => {
  socket.on('join-session', sessionId => {
    socket.join(sessionId);
  });
});

server.listen(3000, () => {
  console.log('서버가 http://localhost:3000 에서 실행 중입니다.');
});
