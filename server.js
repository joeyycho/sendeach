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

// 파일 업로드 설정
const upload = multer({ dest: 'uploads/' });

// EJS 뷰 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 세션 저장소
const sessions = {};

// ✅ QR 페이지 보여주기 (메인 라우트)
app.get('/', async (req, res) => {
  console.log('GET / 요청 들어옴 ✅');

  const sessionId = uuidv4();
  
// QR URL 만들기 (localhost 대신 내부 IP 직접 지정)
const localIP = '192.168.0.8'; // ← 여기에 너 컴퓨터 IP 입력!
const uploadURL = `http://${localIP}:3000/upload/${sessionId}`;

//   const uploadURL = `${req.protocol}://${req.get('host')}/upload/${sessionId}`;
  const qr = await QRCode.toDataURL(uploadURL);

  sessions[sessionId] = { files: [] };
  res.render('qr', { sessionId, qr });
});

// ✅ 업로드 폼 페이지
app.get('/upload/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// ✅ 업로드 처리
app.post('/upload/:sessionId', upload.single('file'), (req, res) => {
  const { sessionId } = req.params;
  if (!sessions[sessionId]) return res.status(400).send('Invalid session');

  sessions[sessionId].files.push(req.file);
  io.to(sessionId).emit('file-uploaded', req.file);
  res.send('파일이 업로드되었습니다.');
});

// ✅ 프린터 화면 페이지
app.get('/session/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ 소켓 연결
io.on('connection', socket => {
  socket.on('join-session', sessionId => {
    socket.join(sessionId);
  });
});

// ✅ 정적 파일 처리 (❗ 맨 아래에 둬야 덮어쓰기 방지 가능)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ✅ 서버 시작
server.listen(3000, () => {
  console.log('서버가 http://localhost:3000 에서 실행 중입니다.');
});
