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

// multer 저장 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // 업로드될 폴더
  },
  filename: (req, file, cb) => {
    // 파일 이름을 제대로 설정, 확장자도 유지
    const ext = path.extname(file.originalname); // 파일 확장자 가져오기
    cb(null, `${uuidv4()}${ext}`); // 고유한 UUID로 파일 이름 생성하고 확장자도 포함
  }
});

const upload = multer({ storage: storage });

// 핀번호 입력 후 업로드 처리
// 기존의 multer 설정에서 단일 파일을 처리하는 부분을 여러 파일을 처리하는 것으로 수정
app.post('/pin', upload.array('file', 30), (req, res) => {
  const { sessionId } = req.body;  // 핀번호를 받음
  const files = req.files;  // 여러 파일을 받음

  // 세션 ID가 유효한지 확인
  if (!sessions[sessionId]) {
    return res.status(400).send('유효하지 않은 핀 번호입니다.');
  }

  // 파일이 업로드되었는지 확인
  if (!files || files.length === 0) {
    return res.status(400).send('파일이 업로드되지 않았습니다.');
  }

  // 업로드된 파일들을 세션에 저장
  sessions[sessionId].files.push(...files);
  
  // 파일 업로드가 완료되면 해당 세션에 업데이트
  files.forEach(file => {
    io.to(sessionId).emit('file-uploaded', file);
  });

  // 업로드가 완료된 후, 업로드된 파일 목록 페이지로 리디렉션
  res.redirect(`/session/${sessionId}`);
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
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

app.use(express.static('public'));

app.get('/upload/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.get('/pin', (req, res) => {
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
