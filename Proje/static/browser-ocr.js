// Original files stay in the browser; only extracted text is sent to CV Studio.
let tesseractPromise;
function loadTesseract() {
  if (!tesseractPromise)
    tesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => {
        tesseractPromise = null;
        reject(
          new Error(
            "OCR bileşeni yüklenemedi. İnternet bağlantısını kontrol et.",
          ),
        );
      };
      document.head.append(script);
    });
  return tesseractPromise;
}
export async function readDocument(file, progress) {
  let worker, pdf;
  const ocr = async (image) => {
    if (!worker) {
      const Tesseract = await loadTesseract();
      worker = await Tesseract.createWorker("tur+eng", 1, {
        logger: (message) =>
          progress(
            message.status === "recognizing text"
              ? `Metin okunuyor: %${Math.round(message.progress * 100)}`
              : "OCR dil modelleri hazırlanıyor…",
          ),
      });
    }
    return (await worker.recognize(image, { rotateAuto: true })).data.text;
  };
  try {
    if (!file.name.toLowerCase().endsWith(".pdf")) return await ocr(file);
    progress("PDF açılıyor…");
    const pdfjs = await import(
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs"
    );
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
    }).promise;
    if (pdf.numPages > 20)
      throw new Error("En fazla 20 sayfalık bir PDF kullan.");
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      progress(`PDF sayfası ${i}/${pdf.numPages} okunuyor…`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let text = content.items
        .map((item) => item.str + (item.hasEOL ? "\n" : " "))
        .join("");
      if (text.trim().length < 30) {
        const viewport = page.getViewport({ scale: 1.5 });
        if (viewport.width * viewport.height > 16000000)
          throw new Error(
            "PDF sayfası çok büyük. Daha düşük çözünürlük kullan.",
          );
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport })
          .promise;
        text = await ocr(canvas);
        canvas.width = canvas.height = 0;
      }
      pages.push(text);
      page.cleanup();
    }
    return pages.join("\n\n");
  } finally {
    if (worker) await worker.terminate();
    if (pdf) await pdf.destroy();
  }
}
