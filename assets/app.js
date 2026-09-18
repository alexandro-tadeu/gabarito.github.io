let questionCount = 10;
let rowsPerTable = 10;
let answerKey = [];
let detected = [];
let imgLoaded = false;
let originalImage = null;
let lastPoints = [];
let manualCorners = [];
let warpedCanvas = null;

const letters = ["A", "B", "C", "D", "E"];

// Modelo da tabela do gabarito depois de corrigida a perspectiva.
// A tabela tem:
// linha 0: instrução
// linha 1: cabeçalho Questão A B C D E
// linhas 2..: questões
const TABLE_MODEL = {
  questionColW: 0.335,
  headerRows: 2,
  instructionH: 0.065,
  headerH: 0.085,
  optionStartX: 0.335,
  optionEndX: 1.0
};

function showTab(id) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.getElementById("btn" + id[0].toUpperCase() + id.slice(1)).classList.add("active");
}

function norm(v) {
  if (v == null) return "";
  v = String(v).trim().toUpperCase();
  if (["-", "_", "BRANCO", "EM BRANCO"].includes(v)) return "";
  v = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const m = v.match(/[A-E]$/);
  return m ? m[0] : "";
}

function parseKey(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  if (raw.includes(",") || raw.includes(";")) {
    return raw.split(/[,\;\n]+/).map(norm).filter(Boolean);
  }

  return raw.split(/\n+/).map(line => {
    const tokens = line.trim().split(/[\s\-\|\:\)\.]+/).filter(Boolean);
    return tokens.length ? norm(tokens[tokens.length - 1]) : "";
  }).filter(Boolean);
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshSettings() {
  questionCount = parseInt(document.getElementById("questionCount").value || "10", 10);
  rowsPerTable = parseInt(document.getElementById("rowsPerTable").value || "10", 10);

  if (!Number.isFinite(questionCount) || questionCount < 1 || questionCount > 40) {
    alert("Informe de 1 a 40 questões.");
    return false;
  }

  answerKey = parseKey(document.getElementById("answerKey").value);

  while (detected.length < questionCount) {
    detected.push({ answer: "", status: "blank", confidence: 0, fill: 0, note: "aguardando leitura" });
  }

  detected = detected.slice(0, questionCount);

  return true;
}

function hasOfficialKey() {
  return answerKey.length === questionCount;
}

function prepareCard() {
  if (!refreshSettings()) return;

  detected = Array.from({ length: questionCount }, () => ({
    answer: "",
    status: "blank",
    confidence: 0,
    fill: 0,
    note: "aguardando leitura"
  }));

  renderSheet();
  updateResults();
  showTab("sheet");
}

function renderSheet() {
  const component = escapeHtml(document.getElementById("component").value || "BANCO DE DADOS I");
  const course = escapeHtml(document.getElementById("course").value || "");
  const moduleText = escapeHtml(document.getElementById("module").value || "");
  const periodo = escapeHtml(document.getElementById("periodo").value || "");
  const teacher = escapeHtml(document.getElementById("teacher").value || "");
  const dateText = escapeHtml(document.getElementById("dateText").value || "__/__/____");

  let rows = "";

  for (let q = 1; q <= questionCount; q++) {
    rows += `
      <tr class="omr-row">
        <td class="qcell">Questão<br>${q}</td>
        ${letters.map(L => `
          <td class="optcell">
            <span class="optletter">${L}</span>
            <span class="bubble"></span>
          </td>
        `).join("")}
      </tr>
    `;
  }

  const html = `
    <div class="a4">
      <div class="logo-row">
        <div class="logo-cell">
          <div class="etec-logo">Etec</div>
          <div class="logo-sub">Escola Técnica Estadual</div>
        </div>
        <div class="logo-cell">
          <div class="cps-logo">CPS</div>
          <div class="logo-sub">Centro Paula Souza</div>
        </div>
        <div class="logo-cell">
          <div class="sp-logo">SÃO PAULO</div>
          <div class="logo-sub">Governo do Estado</div>
        </div>
      </div>

      <div class="top-area">
        <table class="info-table">
          <tr><td colspan="3">COMPONENTE CURRICULAR: ${component}</td></tr>
          <tr><td colspan="3">Aluno(a):</td></tr>
          <tr>
            <td>Curso: ${course}</td>
            <td>Módulo/Série:<br>${moduleText}</td>
            <td>Período:<br>${periodo}</td>
          </tr>
          <tr>
            <td>Professor: ${teacher}</td>
            <td>Data:<br>${dateText}</td>
            <td>MENÇÃO</td>
          </tr>
        </table>

        <div class="instructions">
          <h3>📋 Instruções da atividade</h3>
          <ul>
            <li>Escreva seu nome completo no topo desta página, no local indicado.</li>
            <li>Informe a data da aplicação dessa atividade no espaço reservado.</li>
            <li>Não é permitido qualquer tipo de consulta, nem o uso de dispositivos eletrônicos ou audiovisuais.</li>
            <li>Não é permitida a troca de materiais entre os alunos durante a atividade.</li>
            <li>A avaliação será composta por questões dissertativas e objetivas.</li>
            <li>Após assinalar as questões objetivas, justifique cada resposta quando solicitado.</li>
            <li>As respostas devem ser escritas com caneta esferográfica preta ou azul.</li>
            <li>Escreva de forma legível.</li>
            <li>O entendimento das questões faz parte da avaliação.</li>
            <li>Preencha completamente o espaço indicado para cada questão objetiva.</li>
          </ul>

          <div class="example-line">
            <span>EXEMPLO</span>
            <span class="excell">A</span>
            <span class="excell marked">B</span>
            <span class="excell">C</span>
            <span class="excell">D</span>
            <span class="excell">E</span>
          </div>
        </div>
      </div>

      <div class="gabarito-area">
        <div class="gabarito-title">GABARITO</div>

        <table class="omr-table">
          <tr><th class="omr-instruction" colspan="6">CLIQUE NOS 4 CANTOS SOMENTE DA TABELA ABAIXO</th></tr>
          <tr class="omr-header">
            <th>Questão</th>
            <th>A</th>
            <th>B</th>
            <th>C</th>
            <th>D</th>
            <th>E</th>
          </tr>
          ${rows}
        </table>

        <div class="occ">OCORRÊNCIAS <span>(Para uso do docente)</span></div>
      </div>
    </div>
  `;

  document.getElementById("sheetPreview").innerHTML = html;
}

function loadPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();

  img.onload = () => {
    originalImage = img;
    imgLoaded = true;
    lastPoints = [];
    manualCorners = [];
    warpedCanvas = null;

    const canvas = document.getElementById("photoCanvas");
    const ctx = canvas.getContext("2d");

    const sourceId = e && e.target ? e.target.id : "";
    const maxWidth = sourceId === "cameraInput" ? 2400 : 1900;
    const scale = Math.min(1, maxWidth / img.width);

    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.style.display = "block";

    document.getElementById("photoStatus").textContent =
      "Foto carregada. Toque nos 4 cantos EXTERNOS da borda preta da tabela inteira. Não clique na linha entre Questão e A.";

    renderManualOverlay();
  };

  img.src = URL.createObjectURL(file);
}

function waitForOpenCV() {
  return new Promise((resolve, reject) => {
    if (window.cvReady && typeof cv !== "undefined" && cv.Mat) {
      resolve();
      return;
    }

    let tries = 0;
    const timer = setInterval(() => {
      tries++;

      if (window.cvReady && typeof cv !== "undefined" && cv.Mat) {
        clearInterval(timer);
        resolve();
      }

      if (tries > 80) {
        clearInterval(timer);
        reject(new Error("OpenCV.js ainda não carregou."));
      }
    }, 250);
  });
}

function orderCorners(points) {
  if (!points || points.length < 4) return null;

  const tl = points.reduce((best, p) => (p.x + p.y) < (best.x + best.y) ? p : best, points[0]);
  const br = points.reduce((best, p) => (p.x + p.y) > (best.x + best.y) ? p : best, points[0]);
  const tr = points.reduce((best, p) => (p.x - p.y) > (best.x - best.y) ? p : best, points[0]);
  const bl = points.reduce((best, p) => (p.x - p.y) < (best.x - best.y) ? p : best, points[0]);

  return [tl, tr, br, bl];
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getWarpSizeForTable(corners) {
  const [tl, tr, br, bl] = orderCorners(corners);
  const width = Math.round(Math.max(distance(tl, tr), distance(bl, br)));
  const height = Math.round(Math.max(distance(tl, bl), distance(tr, br)));

  return {
    width: Math.max(780, Math.min(1400, width)),
    height: Math.max(420, Math.min(1500, height))
  };
}

function warpTableByCorners(src, corners) {
  const ordered = orderCorners(corners);
  const size = getWarpSizeForTable(ordered);

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered[0].x, ordered[0].y,
    ordered[1].x, ordered[1].y,
    ordered[2].x, ordered[2].y,
    ordered[3].x, ordered[3].y
  ]);

  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    size.width, 0,
    size.width, size.height,
    0, size.height
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();

  cv.warpPerspective(
    src,
    dst,
    M,
    new cv.Size(size.width, size.height),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  srcTri.delete();
  dstTri.delete();
  M.delete();

  return dst;
}

function createBinaryForOMR(warped) {
  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let binary = new cv.Mat();

  cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);

  cv.adaptiveThreshold(
    blur,
    binary,
    255,
    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv.THRESH_BINARY_INV,
    31,
    10
  );

  gray.delete();
  blur.delete();

  return binary;
}

function measureCellFill(binary, cx, cy, rx, ry) {
  const x0 = Math.max(0, Math.round(cx - rx));
  const y0 = Math.max(0, Math.round(cy - ry));
  const x1 = Math.min(binary.cols, Math.round(cx + rx));
  const y1 = Math.min(binary.rows, Math.round(cy + ry));

  if (x1 <= x0 || y1 <= y0) return 0;

  const rect = new cv.Rect(x0, y0, x1 - x0, y1 - y0);
  const roi = binary.roi(rect);

  let mask = new cv.Mat.zeros(roi.rows, roi.cols, cv.CV_8UC1);
  const center = new cv.Point(Math.round(roi.cols / 2), Math.round(roi.rows / 2));
  const axes = new cv.Size(Math.round(roi.cols * 0.27), Math.round(roi.rows * 0.27));

  cv.ellipse(mask, center, axes, 0, 0, 360, new cv.Scalar(255), -1);

  const masked = new cv.Mat();
  cv.bitwise_and(roi, mask, masked);

  const dark = cv.countNonZero(masked);
  const total = cv.countNonZero(mask);
  const fill = total ? dark / total : 0;

  roi.delete();
  mask.delete();
  masked.delete();

  return fill;
}


function positionsFromProjection(proj, minValue, expectedMinDistance) {
  const groups = [];
  let start = -1;
  let sum = 0;
  let weight = 0;

  for (let i = 0; i < proj.length; i++) {
    if (proj[i] >= minValue) {
      if (start < 0) {
        start = i;
        sum = 0;
        weight = 0;
      }
      sum += i * proj[i];
      weight += proj[i];
    } else if (start >= 0) {
      const end = i - 1;
      const center = weight ? (sum / weight) : ((start + end) / 2);
      groups.push({ start, end, center });
      start = -1;
    }
  }

  if (start >= 0) {
    const end = proj.length - 1;
    const center = weight ? (sum / weight) : ((start + end) / 2);
    groups.push({ start, end, center });
  }

  const centers = groups.map(g => g.center).sort((a, b) => a - b);
  const merged = [];

  centers.forEach(x => {
    if (!merged.length || Math.abs(x - merged[merged.length - 1]) > expectedMinDistance) {
      merged.push(x);
    } else {
      merged[merged.length - 1] = (merged[merged.length - 1] + x) / 2;
    }
  });

  return merged;
}

function detectGridLinesFromWarped(warped) {
  let gray = new cv.Mat();
  let binary = new cv.Mat();
  let vertical = new cv.Mat();
  let horizontal = new cv.Mat();

  try {
    cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);

    cv.adaptiveThreshold(
      gray,
      binary,
      255,
      cv.ADAPTIVE_THRESH_MEAN_C,
      cv.THRESH_BINARY_INV,
      31,
      10
    );

    const vKernelSize = Math.max(18, Math.round(warped.rows / 18));
    const hKernelSize = Math.max(18, Math.round(warped.cols / 12));

    const vKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, vKernelSize));
    const hKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(hKernelSize, 1));

    cv.erode(binary, vertical, vKernel);
    cv.dilate(vertical, vertical, vKernel);

    cv.erode(binary, horizontal, hKernel);
    cv.dilate(horizontal, horizontal, hKernel);

    vKernel.delete();
    hKernel.delete();

    const vProj = new Array(warped.cols).fill(0);
    const hProj = new Array(warped.rows).fill(0);

    for (let y = 0; y < warped.rows; y++) {
      for (let x = 0; x < warped.cols; x++) {
        if (vertical.ucharPtr(y, x)[0] > 0) vProj[x]++;
        if (horizontal.ucharPtr(y, x)[0] > 0) hProj[y]++;
      }
    }

    let xLines = positionsFromProjection(
      vProj,
      Math.max(15, warped.rows * 0.20),
      Math.max(8, warped.cols * 0.018)
    );

    let yLines = positionsFromProjection(
      hProj,
      Math.max(15, warped.cols * 0.18),
      Math.max(6, warped.rows * 0.012)
    );

    xLines = xLines.filter(x => x >= 0 && x <= warped.cols).sort((a, b) => a - b);
    yLines = yLines.filter(y => y >= 0 && y <= warped.rows).sort((a, b) => a - b);

    if (!xLines.length || xLines[0] > warped.cols * 0.035) xLines.unshift(0);
    if (xLines[xLines.length - 1] < warped.cols * 0.965) xLines.push(warped.cols - 1);

    if (!yLines.length || yLines[0] > warped.rows * 0.035) yLines.unshift(0);
    if (yLines[yLines.length - 1] < warped.rows * 0.965) yLines.push(warped.rows - 1);

    return { xLines, yLines };
  } finally {
    gray.delete();
    binary.delete();
    vertical.delete();
    horizontal.delete();
  }
}

function fallbackGridLines(w, h) {
  const xLines = [
    0,
    TABLE_MODEL.questionColW * w,
    TABLE_MODEL.questionColW * w + ((1 - TABLE_MODEL.questionColW) * w) / 5,
    TABLE_MODEL.questionColW * w + ((1 - TABLE_MODEL.questionColW) * w) * 2 / 5,
    TABLE_MODEL.questionColW * w + ((1 - TABLE_MODEL.questionColW) * w) * 3 / 5,
    TABLE_MODEL.questionColW * w + ((1 - TABLE_MODEL.questionColW) * w) * 4 / 5,
    w - 1
  ];

  const yLines = [];
  yLines.push(0);
  yLines.push(TABLE_MODEL.instructionH * h);
  yLines.push((TABLE_MODEL.instructionH + TABLE_MODEL.headerH) * h);

  const questionAreaTop = (TABLE_MODEL.instructionH + TABLE_MODEL.headerH) * h;
  const rowH = (h - questionAreaTop) / questionCount;

  for (let i = 1; i <= questionCount; i++) {
    yLines.push(questionAreaTop + rowH * i);
  }

  return { xLines, yLines };
}

function normalizeGridLinesForOMR(warped, detectedLines) {
  const w = warped.cols;
  const h = warped.rows;
  let { xLines, yLines } = detectedLines || fallbackGridLines(w, h);

  xLines = xLines.slice().sort((a, b) => a - b);
  yLines = yLines.slice().sort((a, b) => a - b);

  if (xLines.length < 7) {
    return fallbackGridLines(w, h);
  }

  if (xLines.length > 7) {
    const first = xLines[0];
    const last = xLines[xLines.length - 1];
    const selected = [first];

    for (let k = 1; k < 6; k++) {
      const target = first + (last - first) * k / 6;
      const nearest = xLines.reduce((best, x) => Math.abs(x - target) < Math.abs(best - target) ? x : best, xLines[0]);
      selected.push(nearest);
    }

    selected.push(last);
    xLines = [...new Set(selected.map(x => Math.round(x)))].sort((a, b) => a - b);
  }

  const neededY = questionCount + 3;

  if (yLines.length < neededY) {
    return fallbackGridLines(w, h);
  }

  if (yLines.length > neededY) {
    const first = yLines[0];
    const last = yLines[yLines.length - 1];
    const selected = [first];

    for (let k = 1; k < neededY - 1; k++) {
      const target = first + (last - first) * k / (neededY - 1);
      const nearest = yLines.reduce((best, y) => Math.abs(y - target) < Math.abs(best - target) ? y : best, yLines[0]);
      selected.push(nearest);
    }

    selected.push(last);
    yLines = [...new Set(selected.map(y => Math.round(y)))].sort((a, b) => a - b);

    if (yLines.length !== neededY) {
      return fallbackGridLines(w, h);
    }
  }

  return { xLines, yLines };
}

function measureCellFillMulti(binary, cx, cy, rx, ry) {
  const offsets = [0, -0.14, 0.14];
  let best = 0;

  offsets.forEach(off => {
    const val = measureCellFill(binary, cx, cy + ry * off, rx, ry);
    if (val > best) best = val;
  });

  return best;
}



function validateFullTableGrid(warped, grid) {
  if (!grid || !Array.isArray(grid.xLines) || !Array.isArray(grid.yLines)) {
    return { ok: false, reason: "Não foi possível identificar a grade da tabela." };
  }

  const xLines = grid.xLines.slice().sort((a, b) => a - b);
  const yLines = grid.yLines.slice().sort((a, b) => a - b);

  if (xLines.length < 7) {
    return {
      ok: false,
      reason: "A tabela inteira não foi selecionada. Clique nos cantos externos, pegando a coluna Questão e também a coluna E."
    };
  }

  if (yLines.length < questionCount + 3) {
    return {
      ok: false,
      reason: "A altura da tabela não foi selecionada corretamente. Clique do topo da tabela até a borda inferior da questão final."
    };
  }

  const tableW = warped.cols;
  const tableH = warped.rows;

  const qColW = xLines[1] - xLines[0];
  const optionW = (xLines[xLines.length - 1] - xLines[1]) / 5;

  // Se a coluna Questão ficou quase sem largura, é sinal de que o usuário clicou
  // na linha entre Questão e A, como apareceu na imagem enviada.
  if (qColW < optionW * 1.15) {
    return {
      ok: false,
      reason: "O canto esquerdo foi marcado dentro da tabela, provavelmente na linha entre Questão e A. Marque a borda externa antes da coluna Questão."
    };
  }

  // A tabela completa precisa ter largura suficiente; se selecionou só A-D, a grade costuma ficar estreita.
  const selectedW = xLines[xLines.length - 1] - xLines[0];
  if (selectedW < tableW * 0.82) {
    return {
      ok: false,
      reason: "A seleção ficou estreita. Pegue a tabela inteira, incluindo a coluna Questão à esquerda e a coluna E à direita."
    };
  }

  return { ok: true, reason: "" };
}


function readOMRFromWarpedTable(warped, modeLabel) {
  refreshSettings();

  const binary = createBinaryForOMR(warped);
  const fillThreshold = parseFloat(document.getElementById("fillThreshold").value || "0.10");
  const diffThreshold = parseFloat(document.getElementById("diffThreshold").value || "0.018");
  const keyOK = hasOfficialKey();

  detected = [];
  lastPoints = [];

  const w = warped.cols;
  const h = warped.rows;

  const rawGrid = detectGridLinesFromWarped(warped);
  const validationBeforeFallback = validateFullTableGrid(warped, rawGrid);

  if (!validationBeforeFallback.ok) {
    binary.delete();
    cv.imshow(document.getElementById("photoCanvas"), warped);
    document.getElementById("photoStatus").textContent =
      "Leitura bloqueada: " + validationBeforeFallback.reason;
    alert("Leitura bloqueada: " + validationBeforeFallback.reason);
    return;
  }

  const grid = normalizeGridLinesForOMR(warped, rawGrid);
  const xLines = grid.xLines;
  const yLines = grid.yLines;

  for (let q = 0; q < questionCount; q++) {
    const yTop = yLines[q + 2];
    const yBottom = yLines[q + 3];

    const rowH = Math.max(1, yBottom - yTop);
    const cy = yTop + rowH * 0.64;

    const scores = letters.map((letter, i) => {
      const xLeft = xLines[i + 1];
      const xRight = xLines[i + 2];
      const cellW = Math.max(1, xRight - xLeft);
      const cx = (xLeft + xRight) / 2;

      const rx = cellW * 0.22;
      const ry = rowH * 0.23;
      const fill = measureCellFillMulti(binary, cx, cy, rx, ry);

      return {
        letter,
        fill,
        score: fill,
        x: cx,
        y: cy,
        rx,
        ry
      };
    });

    const ordered = [...scores].sort((a, b) => b.score - a.score);
    const best = ordered[0];
    const second = ordered[1] || { score: 0 };
    const diff = best.score - second.score;

    const marked = scores.filter(s => s.score >= fillThreshold);
    const duplicates = marked.filter(s => s.score >= best.score * 0.82);

    let answer = "";
    let status = "review";
    let note = "";

    if (best.score < Math.max(0.040, fillThreshold * 0.38)) {
      answer = "";
      status = "blank";
      note = `${modeLabel}: sem marca suficiente`;
    } else if (best.score < fillThreshold) {
      answer = best.letter;
      status = "review";
      note = `${modeLabel}: marca fraca`;
    } else if (duplicates.length > 1) {
      answer = best.letter;
      status = "review";
      note = `${modeLabel}: possível duplicidade`;
    } else if (diff < diffThreshold) {
      answer = best.letter;
      status = "review";
      note = `${modeLabel}: diferença baixa`;
    } else {
      answer = best.letter;
      status = keyOK ? (answer === answerKey[q] ? "ok" : "err") : "read";
      note = `${modeLabel}: lida`;
    }

    detected.push({
      answer,
      status,
      confidence: diff,
      fill: best.score,
      note,
      scores
    });

    scores.forEach(s => {
      lastPoints.push({ x: s.x, y: s.y, rx: s.rx, ry: s.ry, status: "review" });
    });

    lastPoints.push({ x: best.x, y: best.y, rx: best.rx, ry: best.ry, status });
  }

  binary.delete();

  drawWarpedWithOverlay(warped, xLines, yLines);
  updateResults();

  const lidas = detected.filter(d => d.answer).length;
  document.getElementById("photoStatus").textContent =
    `Leitura concluída: ${lidas} de ${questionCount} respostas prováveis. Confira antes de corrigir.`;
}

function drawWarpedWithOverlay(warped, xLines, yLines) {
  const canvas = document.getElementById("photoCanvas");
  cv.imshow(canvas, warped);
  canvas.style.display = "block";

  const ctx = canvas.getContext("2d");

  if (Array.isArray(xLines) && Array.isArray(yLines)) {
    ctx.save();
    ctx.strokeStyle = "rgba(34, 197, 94, .40)";
    ctx.lineWidth = 1;

    xLines.forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    });

    yLines.forEach(y => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    });

    ctx.restore();
  }

  lastPoints.forEach(p => {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);

    if (p.status === "ok") {
      ctx.strokeStyle = "#16a34a";
      ctx.fillStyle = "rgba(22, 163, 74, .15)";
    } else if (p.status === "err") {
      ctx.strokeStyle = "#dc2626";
      ctx.fillStyle = "rgba(220, 38, 38, .15)";
    } else if (p.status === "read") {
      ctx.strokeStyle = "#0284c7";
      ctx.fillStyle = "rgba(2, 132, 199, .15)";
    } else {
      ctx.strokeStyle = "#9333ea";
      ctx.fillStyle = "rgba(147, 51, 234, .08)";
    }

    ctx.lineWidth = p.status === "review" ? 1 : 3;
    ctx.fill();
    ctx.stroke();
  });
}

async function readByTableCorners() {
  try {
    if (!imgLoaded) {
      alert("Tire a foto ou escolha uma imagem primeiro.");
      return;
    }

    if (!refreshSettings()) return;

    if (manualCorners.length !== 4) {
      alert("Toque nos 4 cantos externos da tabela do gabarito antes de usar esta opção.");
      return;
    }

    await waitForOpenCV();

    renderManualOverlay();

    const canvas = document.getElementById("photoCanvas");
    const src = cv.imread(canvas);
    const corners = orderCorners(manualCorners);
    const warped = warpTableByCorners(src, corners);

    if (warpedCanvas && warpedCanvas.delete) warpedCanvas.delete();
    warpedCanvas = warped;

    readOMRFromWarpedTable(warped, "4 cantos da tabela");

    src.delete();
  } catch (err) {
    alert("Erro na leitura pelos 4 cantos: " + err.message);
  }
}

function detectTableAutomatically(src) {
  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let edges = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 40, 120);

    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = src.cols * src.rows;
    let best = null;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();

      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      if (approx.rows === 4) {
        const area = Math.abs(cv.contourArea(approx));
        const rect = cv.boundingRect(approx);
        const ratio = rect.width / Math.max(1, rect.height);

        // A tabela do gabarito é pequena e vertical/retangular.
        // Evita pegar a folha inteira ou a área de instruções.
        if (
          area > imageArea * 0.015 &&
          area < imageArea * 0.35 &&
          ratio > 0.45 &&
          ratio < 1.7 &&
          rect.y > src.rows * 0.25
        ) {
          const pts = [];
          for (let r = 0; r < 4; r++) {
            pts.push({ x: approx.intPtr(r, 0)[0], y: approx.intPtr(r, 0)[1] });
          }

          if (!best || area > best.area) {
            best = { area, points: pts };
          }
        }
      }

      approx.delete();
      cnt.delete();
    }

    return best ? orderCorners(best.points) : null;
  } finally {
    gray.delete();
    blur.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

async function readAutoTable() {
  try {
    if (!imgLoaded) {
      alert("Tire a foto ou escolha uma imagem primeiro.");
      return;
    }

    if (!refreshSettings()) return;

    await waitForOpenCV();

    const canvas = document.getElementById("photoCanvas");
    const src = cv.imread(canvas);
    const corners = detectTableAutomatically(src);

    if (!corners) {
      src.delete();
      alert("Não consegui detectar a tabela com segurança. Use os 4 cantos manuais.");
      return;
    }

    manualCorners = corners;
    const warped = warpTableByCorners(src, corners);

    if (warpedCanvas && warpedCanvas.delete) warpedCanvas.delete();
    warpedCanvas = warped;

    readOMRFromWarpedTable(warped, "OpenCV automático");

    src.delete();
  } catch (err) {
    alert("Erro na detecção automática: " + err.message);
  }
}

function getCanvasPoint(event) {
  const canvas = document.getElementById("photoCanvas");
  const rect = canvas.getBoundingClientRect();

  const touch = event.touches && event.touches.length
    ? event.touches[0]
    : (event.changedTouches && event.changedTouches.length ? event.changedTouches[0] : event);

  return {
    x: (touch.clientX - rect.left) * (canvas.width / rect.width),
    y: (touch.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function addManualCorner(event) {
  if (!imgLoaded) return;

  if (event.cancelable) event.preventDefault();

  if (manualCorners.length >= 4) {
    manualCorners = [];
  }

  manualCorners.push(getCanvasPoint(event));
  renderManualOverlay();

  const missing = 4 - manualCorners.length;

  document.getElementById("photoStatus").textContent =
    missing > 0
      ? `Canto marcado. Faltam ${missing} canto(s). Lembre-se: use a borda externa da tabela inteira.`
      : "4 cantos marcados. Confira se o quadro azul envolve a tabela inteira, da coluna Questão até a coluna E. Depois clique em Ler pelos 4 cantos da tabela.";
}

function clearManualCorners() {
  manualCorners = [];
  renderManualOverlay();

  document.getElementById("photoStatus").textContent =
    "Cantos limpos. Toque nos 4 cantos externos da borda preta da tabela inteira.";
}

function renderManualOverlay() {
  const canvas = document.getElementById("photoCanvas");
  if (!canvas || !imgLoaded || !originalImage) return;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

  if (manualCorners.length) {
    const ordered = manualCorners.length === 4 ? orderCorners(manualCorners) : manualCorners;

    if (ordered.length === 4) {
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ordered[0].x, ordered[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(ordered[i].x, ordered[i].y);
      ctx.closePath();
      ctx.stroke();
    }

    manualCorners.forEach((p, i) => {
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#111827";
      ctx.font = "bold 15px Arial";
      ctx.fillText(String(i + 1), p.x + 10, p.y - 10);
    });

    if (manualCorners.length === 4) {
      ctx.save();
      ctx.fillStyle = "rgba(255, 255, 255, .92)";
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 2;
      ctx.fillRect(12, 12, Math.min(720, canvas.width - 24), 64);
      ctx.strokeRect(12, 12, Math.min(720, canvas.width - 24), 64);
      ctx.fillStyle = "#7c2d12";
      ctx.font = "bold 18px Arial";
      ctx.fillText("Confira: o quadro azul deve envolver a tabela inteira.", 24, 38);
      ctx.font = "15px Arial";
      ctx.fillText("Ele precisa pegar a coluna Questão e todas as alternativas A, B, C, D e E.", 24, 62);
      ctx.restore();
    }
  }
}

function finalStatus(i) {
  const it = detected[i] || { answer: "", status: "blank" };
  const keyOK = hasOfficialKey();

  if (it.status === "review") return { className: "review", label: "Revisar" };
  if (!it.answer) return { className: "blank", label: "Em branco" };
  if (!keyOK) return { className: "read", label: "Resposta lida" };
  if (it.answer === answerKey[i]) return { className: "ok", label: "Correta" };

  return { className: "err", label: "Errada" };
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatPercent(v) {
  return (safeNumber(v) * 100).toFixed(1).replace(".", ",") + "%";
}

function formatScore(v) {
  return safeNumber(v).toFixed(2).replace(".", ",");
}

function getMentionByPercent(p) {
  p = safeNumber(p);

  if (p <= 0) return { code: "-", label: "Sem nota", range: "0%" };
  if (p <= 0.25) return { code: "I", label: "Insatisfatório", range: "até 25%" };
  if (p <= 0.50) return { code: "R", label: "Regular", range: "até 50%" };
  if (p <= 0.75) return { code: "B", label: "Bom", range: "até 75%" };

  return { code: "MB", label: "Muito bom", range: "até 100%" };
}

function updateResults() {
  answerKey = parseKey(document.getElementById("answerKey").value);

  const keyOK = hasOfficialKey();
  const total = questionCount || 0;
  const read = detected.filter(it => it && it.answer).length;
  const correct = keyOK
    ? detected.filter((it, i) => it && it.answer === answerKey[i] && it.status !== "review").length
    : null;

  const wrong = keyOK
    ? detected.filter((it, i) => ["err", "blank", "review"].includes(finalStatus(i).className)).length
    : null;

  const scoreMax = parseFloat(document.getElementById("scoreMax").value || "10");
  const percent = keyOK && total ? correct / total : null;
  const score = percent !== null ? percent * scoreMax : null;
  const mention = percent !== null ? getMentionByPercent(percent) : { code: "-" };

  document.getElementById("metricTotal").textContent = total;
  document.getElementById("metricRead").textContent = read;
  document.getElementById("metricCorrect").textContent = keyOK ? correct : "-";
  document.getElementById("metricWrong").textContent = keyOK ? wrong : "-";
  document.getElementById("metricScore").textContent = keyOK ? formatScore(score) : "-";
  document.getElementById("metricMention").textContent = keyOK ? mention.code : "-";

  renderTable();
  renderQuickReview();
}

function renderTable() {
  let html = `
    <table class="result">
      <thead>
        <tr>
          <th>Questão</th>
          <th>Gabarito</th>
          <th>Lida</th>
          <th>Ajuste</th>
          <th>Situação</th>
          <th>Preenchimento</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (let i = 0; i < questionCount; i++) {
    const it = detected[i] || { answer: "", status: "blank", fill: 0 };
    const st = finalStatus(i);

    html += `
      <tr class="${st.className}">
        <td>${i + 1}</td>
        <td>${answerKey[i] || "-"}</td>
        <td>${it.answer || "-"}</td>
        <td>
          <select class="answer-select" onchange="manualAdjust(${i}, this.value)">
            <option value="" ${it.answer === "" ? "selected" : ""}>Branco</option>
            ${letters.map(L => `<option value="${L}" ${it.answer === L ? "selected" : ""}>${L}</option>`).join("")}
          </select>
        </td>
        <td>
          <span class="badge ${st.className}">${st.label}</span><br>
          <span class="score-mini">${it.note || ""}</span>
        </td>
        <td class="score-mini">${formatPercent(it.fill || 0)} / conf. ${formatPercent(it.confidence || 0)}</td>
      </tr>
    `;
  }

  html += `</tbody></table>`;

  document.getElementById("resultTable").innerHTML = html;
}

function ensureDetected() {
  while (detected.length < questionCount) {
    detected.push({ answer: "", status: "blank", confidence: 0, fill: 0, note: "manual" });
  }
}

function manualAdjust(i, v) {
  ensureDetected();

  detected[i].answer = v;
  detected[i].note = "conferido manualmente";
  detected[i].fill = 1;
  detected[i].confidence = 1;

  if (!v) {
    detected[i].status = "blank";
  } else {
    detected[i].status = hasOfficialKey()
      ? (v === answerKey[i] ? "ok" : "err")
      : "read";
  }

  updateResults();
}

function renderQuickReview() {
  const c = document.getElementById("quickReview");
  if (!c) return;

  ensureDetected();

  let html = "";

  for (let i = 0; i < questionCount; i++) {
    const current = detected[i] && detected[i].answer ? detected[i].answer : "";

    html += `<div class="review-row"><strong>Q${i + 1}</strong>`;

    letters.forEach(L => {
      html += `<button type="button" class="${current === L ? "selected" : ""}" onclick="manualAdjust(${i}, '${L}')">${L}</button>`;
    });

    html += `</div>`;
  }

  c.innerHTML = html;
}

function applyOfficialKey() {
  answerKey = parseKey(document.getElementById("answerKey").value);

  if (answerKey.length !== questionCount) {
    alert(`Para corrigir, informe o gabarito oficial com exatamente ${questionCount} respostas. Atualmente há ${answerKey.length}.`);
    return;
  }

  ensureDetected();

  detected = detected.map((it, i) => {
    if (!it.answer) return { ...it, status: "blank" };
    if (it.status === "review") return it;
    return { ...it, status: it.answer === answerKey[i] ? "ok" : "err" };
  });

  updateResults();
  document.getElementById("photoStatus").textContent = "Correção aplicada com o gabarito oficial.";
}

function copySummary() {
  const keyOK = hasOfficialKey();
  const name = document.getElementById("studentName").value.trim() || "Aluno";
  const respostas = detected.map((it, i) => `${i + 1}-${it.answer || "Branco"}`).join(", ");

  let txt = `Leitura por foto - Modelo Etec\nAluno: ${name}\nQuantidade de questões: ${questionCount}\nRespostas lidas: ${respostas}`;

  if (keyOK) {
    const correct = detected.filter((it, i) => it && it.answer === answerKey[i] && it.status !== "review").length;
    const percent = questionCount ? correct / questionCount : 0;
    const scoreMax = parseFloat(document.getElementById("scoreMax").value || "10");
    const score = percent * scoreMax;
    const mention = getMentionByPercent(percent);

    txt += `\nAcertos: ${correct}\nPercentual: ${(percent * 100).toFixed(0)}%\nNota: ${formatScore(score)}\nMenção: ${mention.code} — ${mention.label}`;
  }

  navigator.clipboard.writeText(txt)
    .then(() => alert("Resumo copiado."))
    .catch(() => alert(txt));
}

function downloadCSV() {
  let csv = "Questao;Gabarito;Lida;Situacao;Preenchimento;Confianca;Observacao\n";

  for (let i = 0; i < questionCount; i++) {
    const it = detected[i] || { answer: "", fill: 0, confidence: 0 };
    const st = finalStatus(i);

    csv += `${i + 1};${answerKey[i] || "-"};${it.answer || "-"};${st.label};${formatPercent(it.fill || 0)};${formatPercent(it.confidence || 0)};${it.note || ""}\n`;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "leitura_gabarito_modelo_etec.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function loadExample() {
  document.getElementById("questionCount").value = "10";
  document.getElementById("rowsPerTable").value = "10";
  document.getElementById("scoreMax").value = "10";

  document.getElementById("answerKey").value =
    "1 A\n2 B\n3 C\n4 D\n5 E\n6 A\n7 B\n8 C\n9 D\n10 E";

  prepareCard();
}

function clearAll() {
  questionCount = 10;
  rowsPerTable = 10;
  answerKey = [];
  detected = [];
  imgLoaded = false;
  originalImage = null;
  lastPoints = [];
  manualCorners = [];
  warpedCanvas = null;

  document.getElementById("questionCount").value = "10";
  document.getElementById("rowsPerTable").value = "10";
  document.getElementById("scoreMax").value = "10";
  document.getElementById("answerKey").value = "";
  document.getElementById("studentName").value = "";

  document.getElementById("sheetPreview").innerHTML = "";
  document.getElementById("photoStatus").textContent = "";
  document.getElementById("photoCanvas").style.display = "none";

  updateResults();
  showTab("setup");
}

function setupCanvasTouch() {
  const canvas = document.getElementById("photoCanvas");
  canvas.addEventListener("click", addManualCorner);
  canvas.addEventListener("touchstart", addManualCorner, { passive: false });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

window.addEventListener("load", () => {
  setupCanvasTouch();
  prepareCard();
  showTab("setup");
});
