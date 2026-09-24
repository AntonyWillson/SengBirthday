/* ================================================================
   KIRIM FOTO OTOMATIS VIA EMAIL (EmailJS) — tanpa server
   ================================================================
   Foto yang diambil Celine akan langsung DIKIRIM KE EMAIL KAMU,
   bukan ke-download ke HP dia. Supaya ini jalan, kamu wajib setup
   akun EmailJS dulu (gratis, ±5 menit):

   1. Daftar di https://www.emailjs.com (bisa pakai akun Google).
   2. Di dashboard, buka "Email Services" → Add New Service → pilih
      Gmail (atau provider lain) → hubungkan ke email kamu.
      Catat SERVICE ID-nya (contoh: service_abc1234).
   3. Buka "Email Templates" → Create New Template. Di editor
      template, mode "Code editor", isi HTML-nya kira-kira begini:

        <p>Foto baru dari {{from_name}}!</p>
        <p>{{message}}</p>
        <img src="{{image}}" style="max-width:100%; border-radius:12px;">

      Lalu set "To email" di pengaturan template ke email kamu sendiri.
      Catat TEMPLATE ID-nya (contoh: template_xyz789).
   4. Buka "Account" → "General" → catat PUBLIC KEY-nya.
   5. Ganti tiga nilai di bawah ini dengan punya kamu:
   ================================================================ */
const EMAILJS_PUBLIC_KEY  = 'KfOwp-Auef-tmJqK7';   // dari Account → General
const EMAILJS_SERVICE_ID  = 'service_rn09zhe';   // dari Email Services
const EMAILJS_TEMPLATE_ID = 'template_ztlrj8v';  // dari Email Templates

if (window.emailjs && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

/* ---------------- ENTRY GATE ---------------- */
const gate = document.getElementById('gate');
const gateYes = document.getElementById('gateYes');
const gateNo = document.getElementById('gateNo');
const gateHint = document.getElementById('gateHint');
const site = document.getElementById('site');
const bgMusic = document.getElementById('bgMusic');
const musicToggle = document.getElementById('musicToggle');

// EDIT ME: ganti kalimat-kalimat lucu yang muncul tiap tombol "Tidak" kabur
const dodgeHints = [
  "eh, jangan bohong ya 👀",
  "coba lagi deh~",
  "yakin nih?",
  "kok gitu sih 😤",
  "gabisa lari terus lho"
];
let dodgeIndex = 0;

function dodgeNoButton() {
  const margin = 60;
  const maxX = window.innerWidth - margin * 2;
  const maxY = window.innerHeight - margin * 2;
  const newX = margin + Math.random() * maxX;
  const newY = margin + Math.random() * maxY;
  gateNo.classList.add('dodging');
  gateNo.style.left = newX + 'px';
  gateNo.style.top = newY + 'px';
  gateHint.textContent = dodgeHints[dodgeIndex % dodgeHints.length];
  dodgeIndex++;
}

// Tombol "Tidak" kabur saat disentuh/di-hover, tidak pernah benar-benar bisa diklik
gateNo.addEventListener('mouseenter', dodgeNoButton);
gateNo.addEventListener('click', (e) => { e.preventDefault(); dodgeNoButton(); });
gateNo.addEventListener('touchstart', (e) => { e.preventDefault(); dodgeNoButton(); }, { passive: false });

gateYes.addEventListener('click', () => {
  gate.classList.add('hide');
  site.style.display = 'block';
  musicToggle.style.display = 'flex';
  btsToggle.style.display = 'inline-flex';
  bgMusic.play().catch(() => { /* browser might still block autoplay, user can tap the music button */ });
  musicToggle.classList.add('spinning');
  document.body.style.overflow = 'auto';

  // munculkan popup foto sesaat setelah gerbang kebuka
  setTimeout(() => { openPhotoModal(); }, 700);
});

/* ---------------- PHOTO POPUP ---------------- */
const photoModal = document.getElementById('photoModal');
const photoClose = document.getElementById('photoClose');
const photoVideo = document.getElementById('photoVideo');
const photoResult = document.getElementById('photoResult');
const photoCanvas = document.getElementById('photoCanvas');
const photoError = document.getElementById('photoError');
const photoCaptureBtn = document.getElementById('photoCaptureBtn');
const photoActionsCamera = document.getElementById('photoActionsCamera');
const photoActionsResult = document.getElementById('photoActionsResult');
const photoRetakeBtn = document.getElementById('photoRetakeBtn');
const photoSaveBtn = document.getElementById('photoSaveBtn');
const photoFallbackLabel = document.getElementById('photoFallbackLabel');
const photoFileInput = document.getElementById('photoFileInput');
const photoSendStatus = document.getElementById('photoSendStatus');

let photoStream = null;
let photoMode = null; // 'camera' atau 'file'
let currentPhotoDataUrl = null;

// Mengecilkan ukuran foto (resize + kompres jadi JPEG) supaya muat dikirim
// lewat email. Dicoba beberapa tingkat kualitas sampai ukurannya cukup kecil.
function compressPhoto(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const attempts = [
        { maxWidth: 480, quality: 0.6 },
        { maxWidth: 400, quality: 0.5 },
        { maxWidth: 320, quality: 0.4 },
        { maxWidth: 260, quality: 0.35 }
      ];
      let result = null;
      for (const { maxWidth, quality } of attempts) {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const out = c.toDataURL('image/jpeg', quality);
        result = out;
        // target: base64 di bawah ±45rb karakter (aman untuk limit EmailJS free plan)
        if (out.length < 45000) break;
      }
      resolve(result);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function stopPhotoStream() {
  if (photoStream) {
    photoStream.getTracks().forEach(track => track.stop());
    photoStream = null;
  }
}

async function startCamera() {
  photoError.style.display = 'none';
  photoFallbackLabel.style.display = 'none';
  photoResult.style.display = 'none';
  photoActionsResult.style.display = 'none';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    photoVideo.style.display = 'none';
    photoActionsCamera.style.display = 'none';
    photoError.textContent = 'Browser ini gabisa buka kamera langsung. Coba tombol di bawah ya 👇';
    photoError.style.display = 'block';
    photoFallbackLabel.style.display = 'inline-flex';
    return;
  }

  try {
    photoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    photoVideo.srcObject = photoStream;
    photoVideo.style.display = 'block';
    photoActionsCamera.style.display = 'flex';
  } catch (err) {
    // izin ditolak / kamera tidak ada / diblokir karena bukan https
    photoVideo.style.display = 'none';
    photoActionsCamera.style.display = 'none';
    photoError.textContent = 'Kamera tidak bisa diakses otomatis. Coba tombol di bawah ini ya 👇';
    photoError.style.display = 'block';
    photoFallbackLabel.style.display = 'inline-flex';
  }
}

function openPhotoModal() {
  currentPhotoDataUrl = null;
  setSendStatus('', false);
  photoSaveBtn.style.display = '';
  photoSaveBtn.disabled = false;
  photoRetakeBtn.disabled = false;
  photoModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  startCamera();
}

function closePhotoModal() {
  photoModal.classList.remove('open');
  document.body.style.overflow = 'auto';
  stopPhotoStream();
}

photoClose.addEventListener('click', closePhotoModal);
photoModal.addEventListener('click', (e) => {
  if (e.target === photoModal) closePhotoModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && photoModal.classList.contains('open')) closePhotoModal();
});

photoCaptureBtn.addEventListener('click', () => {
  if (!photoStream) return;
  const w = photoVideo.videoWidth || 480;
  const h = photoVideo.videoHeight || 360;
  photoCanvas.width = w;
  photoCanvas.height = h;
  const ctx = photoCanvas.getContext('2d');
  // dibalik biar hasil fotonya sama kayak yang keliatan di preview (efek cermin selfie)
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(photoVideo, 0, 0, w, h);

  currentPhotoDataUrl = photoCanvas.toDataURL('image/png');
  photoMode = 'camera';
  photoResult.src = currentPhotoDataUrl;
  photoResult.style.display = 'block';
  photoVideo.style.display = 'none';
  photoActionsCamera.style.display = 'none';
  photoActionsResult.style.display = 'flex';
  stopPhotoStream();

  if (window.confetti) {
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.4 } });
  }
});

photoRetakeBtn.addEventListener('click', () => {
  currentPhotoDataUrl = null;
  photoResult.style.display = 'none';
  photoActionsResult.style.display = 'none';
  setSendStatus('', false);
  photoSaveBtn.style.display = '';
  photoSaveBtn.disabled = false;
  photoRetakeBtn.disabled = false;
  if (photoMode === 'file') {
    photoFileInput.click();
  } else {
    startCamera();
  }
});

function setSendStatus(text, isError) {
  photoSendStatus.textContent = text;
  photoSendStatus.style.display = text ? 'block' : 'none';
  photoSendStatus.classList.toggle('is-error', !!isError);
}

photoSaveBtn.addEventListener('click', async () => {
  if (!currentPhotoDataUrl) return;

  if (!window.emailjs || EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
    setSendStatus('Belum di-setup sama pembuat web ini. (Isi EMAILJS_PUBLIC_KEY dkk di script.js)', true);
    return;
  }

  photoSaveBtn.disabled = true;
  photoRetakeBtn.disabled = true;
  setSendStatus('Mengirim foto... ⏳', false);

  try {
    const compressed = await compressPhoto(currentPhotoDataUrl);
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      from_name: 'Celine',
      message: 'Foto dari halaman ulang tahun 💕',
      image: compressed
    });
    setSendStatus('Terkirim! Makasih fotonyaaa 💌', false);
    photoRetakeBtn.disabled = false;
    photoSaveBtn.style.display = 'none';
  } catch (err) {
    console.error('Gagal kirim foto:', err);
    setSendStatus('Gagal kirim, coba lagi ya (cek koneksi internet) 🥲', true);
    photoSaveBtn.disabled = false;
    photoRetakeBtn.disabled = false;
  }
});

photoFallbackLabel.addEventListener('click', () => {
  // biarkan input file bawaan yang jalan (buka kamera HP lewat capture="user")
});

photoFileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    currentPhotoDataUrl = reader.result;
    photoMode = 'file';
    photoResult.src = currentPhotoDataUrl;
    photoResult.style.display = 'block';
    photoActionsResult.style.display = 'flex';
    photoFallbackLabel.style.display = 'none';
    photoError.style.display = 'none';
    if (window.confetti) {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.4 } });
    }
  };
  reader.readAsDataURL(file);
});

/* ---------------- BEHIND THE SCENES ---------------- */
// ================================================================
// EDIT ME: daftar foto behind-the-scenes.
// - src   : nama file foto di folder "foto-bts/"
// - caption : keterangan singkat foto itu (boleh dikosongkan: '')
// Tinggal tambah/hapus baris untuk nambah atau kurangi foto.
// ================================================================
const btsPhotos = [
  { src: '/BTS/IMG_3316.JPG', caption: '30 Aug 2026 - Callan tp ga suara seng, soalnya u abis denger cerita serem jadinya sambil ak kerjain ini deh' },
  { src: '/BTS/IMG_3578.JPG', caption: '09 Sep 2026 - HEHE nyicil dikit" seng' },
  { src: '/BTS/IMG_3318.JPG', caption: 'pura-pura sibuk padahal lagi bikin ini' },
  { src: '/BTS/IMG_3319.JPG', caption: 'hampir ketauan di sini 😂' }
];

const btsToggle = document.getElementById('btsToggle');
const btsModal = document.getElementById('btsModal');
const btsClose = document.getElementById('btsClose');
const btsGrid = document.getElementById('btsGrid');

// Bangun grid foto sekali saat halaman dimuat
btsPhotos.forEach(photo => {
  const card = document.createElement('div');
  card.className = 'bts-card';
  card.innerHTML = `
    <div class="bts-frame"><img src="${photo.src}" alt="${photo.caption || 'Behind the scenes'}" loading="lazy"></div>
    ${photo.caption ? `<div class="bts-caption">${photo.caption}</div>` : ''}
  `;
  btsGrid.appendChild(card);
});

function openBtsModal() {
  btsModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeBtsModal() {
  btsModal.classList.remove('open');
  document.body.style.overflow = 'auto';
}

btsToggle.addEventListener('click', openBtsModal);
btsClose.addEventListener('click', closeBtsModal);
btsModal.addEventListener('click', (e) => {
  if (e.target === btsModal) closeBtsModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && btsModal.classList.contains('open')) closeBtsModal();
});

/* ---------------- MUSIC TOGGLE ---------------- */
musicToggle.addEventListener('click', () => {
  if (bgMusic.paused) {
    bgMusic.play();
    musicToggle.textContent = '🔊';
    musicToggle.classList.add('spinning');
  } else {
    bgMusic.pause();
    musicToggle.textContent = '🔇';
    musicToggle.classList.remove('spinning');
  }
});

/* ---------------- CANDLES ---------------- */
const candles = document.querySelectorAll('[data-candle]');
const wishNote = document.getElementById('wishNote');
let blownCount = 0;

candles.forEach(candle => {
  candle.addEventListener('click', () => {
    if (candle.classList.contains('out')) return;
    candle.classList.add('out');
    blownCount++;
    if (window.confetti) {
      const rect = candle.getBoundingClientRect();
      confetti({
        particleCount: 18,
        spread: 45,
        startVelocity: 22,
        origin: {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: rect.top / window.innerHeight
        }
      });
    }
    if (blownCount === candles.length) {
      setTimeout(() => {
        wishNote.classList.add('show');
        if (window.confetti) {
          confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
        }
      }, 300);
    }
  });
});

/* ---------------- BALLOON POP GAME ---------------- */
// EDIT ME: edit these messages — one per balloon
const balloonMessages = [
  "Your laugh is still my favorite sound.",
  "You make ordinary days feel like an occasion.",
  "I love how much you care about the people you love.",
  "You're the easiest person to be myself around.",
  "You're way funnier than you think you are.",
  "I'm genuinely lucky to call you mine."
];
const balloonColors = ['#FF6FA0', '#A98BFF', '#4FD9AC', '#FFC94D', '#FF9AC1', '#7FB8FF'];

const grid = document.getElementById('balloonGrid');
balloonMessages.forEach((msg, i) => {
  const slot = document.createElement('div');
  slot.className = 'balloon-slot';
  const color = balloonColors[i % balloonColors.length];
  slot.innerHTML = `
    <button class="balloon-btn" aria-label="Pop balloon ${i+1}">
      <svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="50" cy="50" rx="42" ry="48" fill="${color}"/>
        <ellipse cx="36" cy="34" rx="10" ry="14" fill="rgba(255,255,255,0.35)"/>
        <polygon points="45,96 55,96 50,108" fill="${color}"/>
        <line x1="50" y1="108" x2="50" y2="128" stroke="${color}" stroke-width="2"/>
      </svg>
    </button>
    <div class="reveal-card">${msg}</div>
  `;
  const btn = slot.querySelector('.balloon-btn');
  const card = slot.querySelector('.reveal-card');
  btn.addEventListener('click', () => {
    if (btn.classList.contains('popped')) return;
    btn.classList.add('popped');
    if (window.confetti) {
      const rect = btn.getBoundingClientRect();
      confetti({
        particleCount: 26,
        spread: 60,
        startVelocity: 28,
        colors: [color, '#ffffff'],
        origin: {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + rect.height / 2) / window.innerHeight
        }
      });
    }
    setTimeout(() => card.classList.add('show'), 150);
  });
  grid.appendChild(slot);
});

/* ---------------- ENVELOPE ---------------- */
const envelope = document.getElementById('envelope');
const letterModal = document.getElementById('letterModal');
const letterClose = document.getElementById('letterClose');

function openLetter() {
  envelope.classList.add('open');
  // beri jeda dikit biar flap amplop kebuka dulu, baru suratnya muncul
  setTimeout(() => {
    letterModal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }, 450);
}

function closeLetter() {
  letterModal.classList.remove('open');
  envelope.classList.remove('open');
  document.body.style.overflow = 'auto';
}

envelope.addEventListener('click', () => {
  if (!envelope.classList.contains('open')) openLetter();
});
letterClose.addEventListener('click', closeLetter);
letterModal.addEventListener('click', (e) => {
  if (e.target === letterModal) closeLetter();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && letterModal.classList.contains('open')) closeLetter();
});

/* ---------------- TULIP & LILY FLOWER SHOWER ---------------- */
// ================================================================
// EDIT ME: warna bunga (kombinasi warna kelopak + tengah bunga), semua nuansa pink.
// Tambah/hapus/ganti baris di bawah untuk mengubah paletnya.
// Format: { petal: 'warna kelopak', center: 'warna tengah bunga' }
// ================================================================
const flowerPalette = [
  { petal: '#FF8FC2', center: '#FFE1EF' }, // pink medium, tengah pink pucat
  { petal: '#FFB6D9', center: '#FF6FA0' }, // pink lembut, tengah pink
  { petal: '#FF6FA0', center: '#FFFFFF' }, // pink, tengah putih
  { petal: '#FFD1E8', center: '#E14F82' }  // pink pucat, tengah pink tua
];

// EDIT ME: berapa banyak bunga yang muncul sekali "tebar"
const FLOWER_COUNT = 34;

// Bikin 1 SVG bunga tulip (bentuk cangkir dari 3 kelopak yang menyatu di bawah)
function createTulipSVG(petalColor, shadeColor) {
  const petal = (rotate) => `<path d="M50,22 C36,36 36,64 50,84 C64,64 64,36 50,22 Z" fill="${petalColor}" transform="rotate(${rotate} 50 84)"/>`;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    ${petal(-24)}
    ${petal(24)}
    ${petal(0)}
    <ellipse cx="50" cy="80" rx="6" ry="4" fill="${shadeColor}" opacity="0.55"/>
  </svg>`;
}

// Bikin 1 SVG bunga lili mekar (6 kelopak lancip + benang sari di tengah)
function createLilySVG(petalColor, centerColor) {
  const numPetals = 6;
  let petals = '';
  for (let i = 0; i < numPetals; i++) {
    const angle = (360 / numPetals) * i;
    petals += `<path d="M50,50 C46,35 42,15 50,8 C58,15 54,35 50,50 Z" fill="${petalColor}" transform="rotate(${angle} 50 50)"/>`;
  }
  let stamens = '';
  for (let i = 0; i < 6; i++) {
    const angle = (360 / 6) * i + 30;
    stamens += `<line x1="50" y1="50" x2="50" y2="28" stroke="#B5568A" stroke-width="1.6" transform="rotate(${angle} 50 50)"/><circle cx="50" cy="28" r="2.4" fill="#B5568A" transform="rotate(${angle} 50 50)"/>`;
  }
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${petals}${stamens}<circle cx="50" cy="50" r="6" fill="${centerColor}"/></svg>`;
}

function createFlowerSVG(type, petalColor, centerColor) {
  return type === 'tulip' ? createTulipSVG(petalColor, centerColor) : createLilySVG(petalColor, centerColor);
}

// Menaburkan bunga tulip & lili pink yang jatuh dari atas layar (gantian random)
function spawnFlowerShower(count = FLOWER_COUNT) {
  for (let i = 0; i < count; i++) {
    const flower = document.createElement('div');
    flower.className = 'flower-fall';

    const palette = flowerPalette[Math.floor(Math.random() * flowerPalette.length)];
    const type = Math.random() < 0.5 ? 'tulip' : 'lily';
    flower.innerHTML = createFlowerSVG(type, palette.petal, palette.center);

    const size = 22 + Math.random() * 26;          // ukuran bunga: 22–48px
    const startX = Math.random() * 100;             // posisi awal horizontal (vw)
    const duration = 4.5 + Math.random() * 3;        // lama jatuh: 4.5–7.5s
    const delay = Math.random() * 1.4;               // jeda mulai supaya tidak barengan semua
    const drift = Math.random() * 180 - 90;          // goyangan ke samping saat jatuh (px)
    const spin = (Math.random() < 0.5 ? 1 : -1) * (180 + Math.random() * 320); // rotasi (deg)

    flower.style.left = startX + 'vw';
    flower.style.width = size + 'px';
    flower.style.height = size + 'px';
    flower.style.animationDuration = duration + 's';
    flower.style.animationDelay = delay + 's';
    flower.style.setProperty('--drift', drift + 'px');
    flower.style.setProperty('--spin', spin + 'deg');

    document.body.appendChild(flower);
    flower.addEventListener('animationend', () => flower.remove());
  }
}

/* ---------------- FINALE ---------------- */
const finaleBtn = document.getElementById('finaleBtn');
const finaleMessage = document.getElementById('finaleMessage');
const finaleSub = document.getElementById('finaleSub');

finaleBtn.addEventListener('click', () => {
  finaleMessage.classList.add('show');
  finaleSub.classList.add('show');
  finaleBtn.style.display = 'none';

  spawnFlowerShower();

  if (window.confetti) {
    const duration = 2000;
    const end = Date.now() + duration;
    (function frame() {
      confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0 } });
      confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    confetti({ particleCount: 140, spread: 100, origin: { y: 0.5 } });
  }
});