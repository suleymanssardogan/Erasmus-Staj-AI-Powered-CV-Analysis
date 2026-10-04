"use strict";
const $ = (id) => document.getElementById(id);
let mode = "file",
  file = null,
  result = null,
  busy = false,
  ocrAvailable = false;
let csrfToken = "",
  account = null,
  excluded = new Set(),
  historyEntries = [];
const roles = {
  backend: ["Python", "SQL", "Git", "Docker", "Flask", "Django", "FastAPI"],
  frontend: ["JavaScript", "TypeScript", "HTML", "CSS", "React", "Git"],
  data: ["Python", "SQL", "PyTorch", "TensorFlow", "Pandas", "NumPy"],
};
function status(message, error = false) {
  $("status").textContent = message;
  $("status").className = error ? "error" : "";
}
async function api(url, options) {
  options = options || {};
  options.headers = { ...options.headers, "X-CSRF-Token": csrfToken };
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.success === false)
    throw new Error(data.error || "İşlem tamamlanamadı.");
  return data;
}
function setMode(next) {
  if (busy) return;
  mode = next;
  for (const key of ["file", "text"]) {
    $(key + "Panel").hidden = key !== mode;
    $(key + "Tab").classList.toggle("active", key === mode);
    $(key + "Tab").setAttribute("aria-pressed", String(key === mode));
  }
  $("analyze").disabled = false;
  status("");
}
$("fileTab").onclick = () => setMode("file");
$("textTab").onclick = () => setMode("text");
function selectFile(candidate) {
  if (busy) return;
  if (
    !/\.(pdf|png|jpe?g|gif|bmp)$/i.test(candidate.name) ||
    candidate.size > 16 * 1024 * 1024 ||
    candidate.size === 0
  ) {
    status("Dolu, desteklenen bir dosya seç. Boyut sınırı 16 MB.", true);
    return;
  }
  file = candidate;
  $("fileName").textContent = candidate.name;
  status(`${(candidate.size / 1024 / 1024).toFixed(2)} MB · Analize hazır`);
}
$("file").onchange = (e) => {
  if (e.target.files[0]) selectFile(e.target.files[0]);
};
$("drop").ondragover = (e) => {
  e.preventDefault();
  $("drop").classList.add("drag");
};
$("drop").ondragleave = () => $("drop").classList.remove("drag");
$("drop").ondrop = (e) => {
  e.preventDefault();
  $("drop").classList.remove("drag");
  if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
};
$("sample").onclick = () => {
  $("text").value =
    "Deniz Yılmaz\ndeniz@example.com\nİstanbul, Türkiye\nEğitim\nİstanbul Üniversitesi — Bilgisayar Mühendisliği, Lisans\nDeneyim\nSoftware Developer Intern — Erasmus, 2025\nBuilt a Flask API and reduced document processing time by 30%.\nImplemented document analysis using Python, OpenCV and Tesseract.\nSkills\nPython, C++, JavaScript, Flask, SQL, SQLite, Git, Docker";
};
async function analyze(text, filename = "Metin analizi") {
  return api("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      filename,
      job: $("job").value,
      excluded: [...excluded],
    }),
  });
}
$("analyze").onclick = async () => {
  if (busy) return;
  if (mode === "file" && !file) {
    status("Önce bir CV dosyası seç.", true);
    return;
  }
  busy = true;
  $("analyze").disabled = true;
  $("file").disabled = true;
  $("analyze").textContent = "Analiz ediliyor…";
  try {
    const started = performance.now();
    let text = $("text").value;
    if (mode === "file") {
      const reader = await import("/static/browser-ocr.js");
      text = await reader.readDocument(file, status);
    }
    if (text.trim().length < 20)
      throw new Error(
        "Okunabilir metin bulunamadı. Daha net bir belge kullan.",
      );
    excluded.clear();
    const data = await analyze(
      text,
      mode === "file" ? file.name : "Metin analizi",
    );
    data.processing_time = Number(
      ((performance.now() - started) / 1000).toFixed(2),
    );
    render(data);
    status("Analiz tamamlandı.");
    await history();
  } catch (e) {
    status(e.message, true);
  } finally {
    busy = false;
    $("file").disabled = false;
    $("analyze").disabled = false;
    $("analyze").textContent = "CV’yi analiz et →";
  }
};
function badges(id, values) {
  const target = $(id);
  target.replaceChildren();
  if (!values.length) {
    target.textContent = "Tespit edilmedi";
    return;
  }
  values.forEach((value) => {
    const el = document.createElement("span");
    el.className = "badge";
    el.textContent = value;
    target.append(el);
  });
}
function list(id, values) {
  $(id).replaceChildren();
  (values.length ? values : ["Tespit edilmedi."]).forEach((value) => {
    const li = document.createElement("li");
    li.textContent = value;
    $(id).append(li);
  });
}
function render(data) {
  result = data;
  excluded = new Set(data.metadata?.excluded_skills || []);
  $("empty").hidden = true;
  $("result").hidden = false;
  const meta = data.metadata || {},
    cv = meta.cv_analysis || {};
  $("resultName").textContent = data.filename;
  $("words").textContent = data.word_count;
  $("skillCount").textContent = (cv.skills || []).length;
  $("seconds").textContent = data.processing_time;
  $("extracted").value = data.extracted_text;
  badges("skills", cv.skills || []);
  list("education", cv.education || []);
  list("experience", cv.experience || []);
  badges("contacts", [...(meta.emails || []), ...(meta.phones || [])]);
  const tips = [];
  if (!(meta.emails || []).length)
    tips.push("E-posta adresi bulunamadı. İletişim bilgilerini kontrol et.");
  if (!(cv.education || []).length)
    tips.push(
      "Eğitim bilgisi bulunamadı. Açık bir eğitim başlığı ve kurum adı ekle.",
    );
  if (!(cv.experience || []).length)
    tips.push(
      "Deneyim bilgisi bulunamadı. Stajlarını ve projelerdeki katkılarını açıkça belirt.",
    );
  if (!/\d+\s*%/.test(data.extracted_text))
    tips.push(
      "Başarılarını gerçek ölçümlerle destekle: süre, kullanıcı sayısı veya iyileşme oranı.",
    );
  if (data.word_count < 100)
    tips.push(
      "Metin oldukça kısa. Eksik sayfa veya OCR kaybı olup olmadığını kontrol et.",
    );
  list(
    "tips",
    tips.length
      ? tips
      : ["Temel bilgiler bulundu. Tarihleri ve çıkarılan metni doğrula."],
  );
  $("versionResult").replaceChildren();
  renderEvidence();
  $("job").value = meta.job_text || "";
  renderJob(meta.job_match);
  match();
}
function hasKeyword(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    "(^|[^\\p{L}\\p{N}_])" + escaped + "(?![\\p{L}\\p{N}_])",
    "iu",
  ).test(text);
}
function match() {
  if (!result) return;
  const keywords = roles[$("role").value],
    found = keywords.filter(
      (k) => !excluded.has(k) && hasKeyword(result.extracted_text, k),
    );
  badges("found", found);
  badges(
    "missing",
    keywords.filter((k) => !found.includes(k)),
  );
  $("match").textContent =
    `Örnek rol sözlüğündeki ${keywords.length} anahtar kelimenin ${found.length} tanesi metinde bulundu.`;
}
$("role").onchange = match;
async function history() {
  try {
    const data = await api("/api/documents");
    historyEntries = data.history;
    $("history").replaceChildren();
    $("previousVersion").replaceChildren(
      new Option("Geçmişten seç veya metin yapıştır", ""),
    );
    if (!data.history.length)
      $("history").textContent = account
        ? "Henüz kayıt yok. Bir CV analiz et."
        : "Geçmiş için giriş yap. Misafir analizleri kaydedilmez.";
    data.history.forEach((doc) => {
      const row = document.createElement("div");
      row.className = "history-row";
      const button = document.createElement("button");
      button.className = "doc";
      button.textContent = doc.filename;
      const small = document.createElement("small");
      small.textContent = new Date(doc.created_at).toLocaleString("tr-TR");
      button.append(small);
      button.onclick = async () => {
        if (busy) return;
        try {
          render((await api("/api/documents/" + doc.id)).document);
          status("Özel analiz açıldı.");
        } catch (e) {
          status(e.message, true);
        }
      };
      const del = document.createElement("button");
      del.className = "subtle";
      del.textContent = "Sil";
      del.setAttribute("aria-label", doc.filename + " analizini sil");
      del.onclick = async () => {
        if (!confirm("Bu analiz kalıcı olarak silinecek. Devam edilsin mi?"))
          return;
        try {
          await api("/api/documents/" + doc.id, { method: "DELETE" });
          await history();
          status("Analiz silindi.");
        } catch (e) {
          status(e.message, true);
        }
      };
      row.append(button, del);
      $("history").append(row);
      $("previousVersion").append(
        new Option(doc.filename + " · " + small.textContent, doc.id),
      );
    });
  } catch (e) {
    $("history").textContent = "Geçmiş yüklenemedi.";
    status(e.message, true);
  }
}
$("refresh").onclick = history;
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(result.extracted_text);
    status("Metin kopyalandı.");
  } catch {
    status("Kopyalama izni yok. Metni seçerek kopyalayabilirsin.", true);
  }
};
$("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "cv-analysis.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
try {
  document.body.classList.toggle(
    "dark",
    localStorage.getItem("cv-theme") === "dark",
  );
} catch {}
$("theme").onclick = () => {
  document.body.classList.toggle("dark");
  try {
    localStorage.setItem(
      "cv-theme",
      document.body.classList.contains("dark") ? "dark" : "light",
    );
  } catch {}
};
async function loadAccount() {
  const data = await api("/api/account");
  csrfToken = data.csrf;
  account = data.user;
  $("authForm").hidden = !!account;
  $("accountSettings").hidden = !account;
  $("accountNote").textContent = account
    ? account.email
    : data.accounts_available
      ? "Hesabınla giriş yap; analizlerin sadece sana görünür."
      : "Canlı hesaplar için kalıcı veritabanı kurulumu bekleniyor. Misafir analizi kullanabilirsin.";
  $("login").disabled = $("register").disabled = !data.accounts_available;
  if (account) $("retention").value = account.retention_days;
  $("accountToggle").textContent = account ? "Hesabım" : "Giriş / kayıt";
}
$("accountToggle").onclick = () => {
  $("accountPanel").hidden = !$("accountPanel").hidden;
};
$("authForm").onsubmit = async (e) => {
  e.preventDefault();
  const action = e.submitter.id;
  try {
    const data = await api("/api/account/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: $("email").value,
        password: $("password").value,
      }),
    });
    csrfToken = data.csrf;
    $("password").value = "";
    await loadAccount();
    await history();
    status("Hesabına giriş yapıldı.");
  } catch (error) {
    status(error.message, true);
  }
};
$("logout").onclick = async () => {
  try {
    await api("/api/account/logout", { method: "POST" });
    await loadAccount();
    result = null;
    $("result").hidden = true;
    $("empty").hidden = false;
    $("oldCV").value = "";
    $("text").value = "";
    await history();
    status("Çıkış yapıldı.");
  } catch (e) {
    status(e.message, true);
  }
};
$("retention").onchange = async () => {
  try {
    await api("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retention_days: Number($("retention").value) }),
    });
    status("Saklama süresi güncellendi.");
  } catch (e) {
    status(e.message, true);
  }
};
function renderEvidence() {
  $("skillEvidence").replaceChildren();
  const proofs = result.metadata.skill_evidence || {};
  for (const [skill, lines] of Object.entries(proofs)) {
    const detail = document.createElement("details"),
      summary = document.createElement("summary");
    summary.textContent =
      skill + (excluded.has(skill) ? " · Hariç tutuldu" : " · Kaynak cümleler");
    detail.append(summary);
    lines.forEach((line) => {
      const p = document.createElement("p");
      p.textContent = line;
      detail.append(p);
    });
    const button = document.createElement("button");
    button.className = "subtle";
    button.textContent = excluded.has(skill)
      ? "Tespiti geri ekle"
      : "Yanlış tespiti hariç tut";
    button.onclick = () => {
      excluded.has(skill) ? excluded.delete(skill) : excluded.add(skill);
      result.metadata.excluded_skills = [...excluded];
      result.metadata.job_match = null;
      result.metadata.cv_analysis.skills = Object.keys(proofs).filter(
        (s) => !excluded.has(s),
      );
      badges("skills", result.metadata.cv_analysis.skills);
      $("skillCount").textContent = result.metadata.cv_analysis.skills.length;
      renderEvidence();
      match();
      $("jobResult").replaceChildren();
      status("Düzeltme uygulandı. Kaydetmek için yeniden analiz et.");
    };
    detail.append(button);
    $("skillEvidence").append(detail);
  }
}
function renderJob(data) {
  $("jobResult").replaceChildren();
  if (!data || !data.requirements.length) {
    if ($("job").value)
      $("jobResult").textContent =
        "İlanda sözlükte tanınan teknik gereksinim bulunamadı.";
    return;
  }
  const note = document.createElement("p");
  note.className = "privacy";
  note.textContent = `${data.requirements.length} teknik terimden ${data.matched.length} tanesi CV’de bulundu. ${data.note}`;
  $("jobResult").append(note);
  for (const [key, title] of [
    ["matched", "Bulundu"],
    ["missing", "Metinde bulunamadı"],
  ]) {
    for (const item of data[key]) {
      const detail = document.createElement("details"),
        summary = document.createElement("summary");
      summary.textContent = title + ": " + item.skill;
      detail.append(summary);
      for (const line of item.job_evidence) {
        const p = document.createElement("p");
        p.textContent = "İlan: " + line;
        detail.append(p);
      }
      for (const line of item.cv_evidence || []) {
        const p = document.createElement("p");
        p.textContent = "CV: " + line;
        detail.append(p);
      }
      $("jobResult").append(detail);
    }
  }
}
$("compareJob").onclick = async () => {
  try {
    const data = await api("/api/job-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: result.extracted_text,
        job: $("job").value,
        excluded: [...excluded],
      }),
    });
    result.metadata.job_text = $("job").value;
    result.metadata.job_match = data.comparison;
    renderJob(data.comparison);
  } catch (e) {
    status(e.message, true);
  }
};
$("previousVersion").onchange = async () => {
  if (!$("previousVersion").value) return;
  try {
    $("oldCV").value = (
      await api("/api/documents/" + $("previousVersion").value)
    ).document.extracted_text;
  } catch (e) {
    status(e.message, true);
  }
};
$("compareVersions").onclick = async () => {
  try {
    const { comparison: c } = await api("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        old: $("oldCV").value,
        new: result.extracted_text,
      }),
    });
    $("versionResult").replaceChildren();
    for (const [label, values] of [
      ["Eklenen beceriler", c.added_skills],
      ["Çıkarılan beceriler", c.removed_skills],
      ["Eklenen / değişen satırlar", c.added_lines],
      ["Çıkarılan / değişen satırlar", c.removed_lines],
    ]) {
      const h = document.createElement("h3");
      h.textContent = label;
      const ul = document.createElement("ul");
      (values.length ? values : ["Değişiklik yok."]).forEach((value) => {
        const li = document.createElement("li");
        li.textContent = value;
        ul.append(li);
      });
      $("versionResult").append(h, ul);
    }
    status(
      `Kelime sayısındaki değişim: ${c.word_delta > 0 ? "+" : ""}${c.word_delta}`,
    );
  } catch (e) {
    status(e.message, true);
  }
};
$("reanalyze").onclick = async () => {
  try {
    render(await analyze($("extracted").value, result.filename));
    await history();
    status("Düzeltilmiş metin analiz edildi.");
  } catch (e) {
    status(e.message, true);
  }
};
$("pdfReport").onclick = async () => {
  const button = $("pdfReport");
  button.disabled = true;
  try {
    const response = await fetch("/api/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        text: result.extracted_text,
        job: $("job").value,
        excluded: [...excluded],
      }),
    });
    if (!response.ok)
      throw new Error((await response.json()).error || "Rapor oluşturulamadı.");
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "cv-studio-report.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("PDF raporu hazır.");
  } catch (e) {
    status(e.message, true);
  } finally {
    button.disabled = false;
  }
};
(async () => {
  try {
    await loadAccount();
    const health = await api("/api/health");
    ocrAvailable = health.ocr_available;
    $("health").textContent = "● PDF ve OCR hazır";
    $("filePanel").querySelector("details").hidden = true;
    setMode("file");
    await history();
  } catch (e) {
    status("Bağlantı kurulamadı: " + e.message, true);
  }
})();
