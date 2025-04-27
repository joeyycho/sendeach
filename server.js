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

// 업로드 폴더 경로
const uploadDir = path.join(__dirname, 'uploads');

// uploads 폴더가 없으면 생성
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log('✅ uploads 폴더 생성 완료');
}

// multer 저장 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ storage: storage });

const sessions = {}; // { sessionId: { files: [], pin: '123456' } }

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 정적 파일 서빙
app.use('/uploads', express.static(uploadDir));
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// 세션용 핀번호 생성 함수
function generatePIN() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// QR 코드 생성 후 메인 페이지 렌더
app.get('/', async (req, res) => {
  try {
    const sessionId = uuidv4();
    const pin = generatePIN();
    const uploadURL = `${req.protocol}://${req.get('host')}/upload/${sessionId}`;
    const qr = await QRCode.toDataURL(uploadURL);

    sessions[sessionId] = { files: [], pin };
    res.render('qr', { sessionId, qr, pin });
  } catch (error) {
    console.error('❌ QR 생성 에러:', error);
    res.status(500).send('서버 에러');
  }
});

// 업로드 페이지 (QR로 접속하는)
app.get('/upload/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// 핀 입력 후 업로드 페이지
app.get('/pin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pin-upload.html'));
});

// 핀 입력해서 세션 찾기
app.post('/upload-by-pin', (req, res) => {
  const { pin } = req.body;
  const sessionId = Object.keys(sessions).find(id => sessions[id].pin === pin);

  if (!sessionId) {
    console.error('❌ 잘못된 PIN 입력:', pin);
    return res.status(400).send('PIN이 잘못되었습니다.');
  }

  res.redirect(`/upload/${sessionId}`);
});

// 파일 업로드 (QR 세션 방식)
app.post('/upload/:sessionId', upload.array('file', 10), (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessions[sessionId]) {
      console.error('❌ 세션 ID 찾을 수 없음:', sessionId);
      return res.status(400).send('Invalid session');
    }

    const uploadedFiles = req.files;
    if (!uploadedFiles || uploadedFiles.length === 0) {
      console.error('❌ 파일 업로드 안 됨');
      return res.status(400).send('파일이 업로드되지 않았습니다.');
    }

    sessions[sessionId].files.push(...uploadedFiles);
    io.to(sessionId).emit('file-uploaded', uploadedFiles);

    console.log(`✅ ${uploadedFiles.length}개 파일 업로드됨 (세션: ${sessionId})`);
    res.send('파일이 업로드되었습니다.');
  } catch (err) {
    console.error('❌ 파일 업로드 중 서버 오류:', err);
    res.status(500).send('서버 오류가 발생했습니다.');
  }
});

// 파일 업로드 (PIN 입력 방식)
app.post('/pin', upload.array('file', 10), (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessions[sessionId]) {
      console.error('❌ 세션 ID 찾을 수 없음 (PIN 방식):', sessionId);
      return res.status(400).send('유효하지 않은 핀 번호입니다.');
    }

    const files = req.files;
    if (!files || files.length === 0) {
      console.error('❌ 파일 업로드 안 됨 (PIN 방식)');
      return res.status(400).send('파일이 업로드되지 않았습니다.');
    }

    sessions[sessionId].files.push(...files);
    files.forEach(file => {
      io.to(sessionId).emit('file-uploaded', file);
    });

    console.log(`✅ ${files.length}개 파일 업로드됨 (PIN방식, 세션: ${sessionId})`);
    res.redirect(`/session/${sessionId}`);
  } catch (error) {
    console.error('❌ PIN 업로드 중 오류 발생:', error);
    res.status(500).send('서버 오류가 발생했습니다.');
  }
});

// 세션 페이지 (파일 확인 페이지)
app.get('/session/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO 연결
io.on('connection', socket => {
  console.log('🔌 소켓 연결됨');
  socket.on('join-session', sessionId => {
    socket.join(sessionId);
    console.log(`📦 세션 참가: ${sessionId}`);
  });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
