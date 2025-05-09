const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const http = require('http');
const path = require('path');
const fs = require('fs');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

// 세션 저장소
const sessions = {}; // { sessionId: { files: [], pin: '123456' } }

// 핀 생성
function generatePIN() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 파일 삭제 예약
function scheduleFileDeletion(file) {
  setTimeout(() => {
    const filePath = path.join(uploadDir, file.filename);
    fs.unlink(filePath, err => {
      if (err) console.error('❌ 파일 삭제 오류:', err);
      else console.log('🗑️ 파일 삭제 완료:', file.filename);
    });
  }, 10 * 60 * 1000); // 10분 후 삭제
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/uploads', express.static(uploadDir));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// QR 코드 생성 및 세션 시작
app.get('/', async (req, res) => {
  const sessionId = uuidv4();
  const pin = generatePIN();
  const uploadURL = `${req.protocol}://${req.get('host')}/upload/${sessionId}`;
  const qr = await QRCode.toDataURL(uploadURL);

  sessions[sessionId] = { files: [], pin };
  res.render('qr', { sessionId, qr, pin });
});

// 업로드 화면 (QR 접근)
app.get('/upload/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!sessions[sessionId]) {
    return res.status(404).send('세션을 찾을 수 없습니다.');
  }
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// PIN 입력 화면
app.get('/pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pin-upload.html'));
});

// 파일 업로드 (QR 방식)
app.post('/upload/:sessionId', upload.array('file', 10), (req, res) => {
  const { sessionId } = req.params;
  if (!sessions[sessionId]) {
    return res.status(400).send('❌ 유효하지 않은 세션입니다.');
  }

  const uploadedFiles = req.files;
  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).send('❌ 파일이 선택되지 않았습니다.');
  }

  sessions[sessionId].files.push(...uploadedFiles);
  uploadedFiles.forEach(file => {
    io.to(sessionId).emit('file-uploaded', file);
    scheduleFileDeletion(file);
  });
  res.send('✅ 파일이 업로드되었습니다.');
});

// PIN 입력 후 업로드 이동
app.post('/upload-by-pin', (req, res) => {
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).send('❌ PIN 번호를 입력해주세요.');
  }

  const sessionId = Object.keys(sessions).find(id => sessions[id].pin === pin);
  if (!sessionId) {
    return res.status(400).send('❌ 유효하지 않은 PIN입니다.');
  }

  res.redirect(`/upload/${sessionId}`);
});

// 세션 화면
app.get('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!sessions[sessionId]) {
    return res.status(404).send('세션을 찾을 수 없습니다.');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 소켓 연결
io.on('connection', socket => {
  socket.on('join-session', sessionId => {
    if (sessions[sessionId]) {
      socket.join(sessionId);
    }
  });
});

// 서버 시작
server.listen(3000, () => {
  console.log('🚀 서버 실행 중! http://localhost:3000');
});
