/* OfferReady — client-side resume text extraction.
 * ---------------------------------------------------------------------------
 * Extracts plain text from a PDF / DOCX / TXT file entirely IN THE BROWSER, so
 * the raw resume never has to be uploaded or stored. Only the extracted text is
 * later sent (transiently) to the gap-analysis endpoint; nothing is persisted
 * server-side (spec: no raw resume at rest).
 *
 * Parser libraries (pdf.js, mammoth) are loaded LAZILY from a CDN the first
 * time a file of that type is picked, so they don't slow the rest of the site.
 *
 * Exposes: window.OfferReadyResume.extract(file) -> Promise<{ text, meta }>.
 * Fails with a clear Error the caller can surface. All client-side.
 */

(function () {
  "use strict";

  var PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  var PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var MAMMOTH_URL = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
  var MAX_BYTES = 8 * 1024 * 1024;   // 8 MB cap
  var MAX_CHARS = 16000;             // matches the API resume cap

  var _loading = {};
  function loadScript(url) {
    if (_loading[url]) return _loading[url];
    _loading[url] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = url; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Could not load a required parser. Check your connection.")); };
      document.head.appendChild(s);
    });
    return _loading[url];
  }

  function readArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error("Could not read the file.")); };
      r.readAsArrayBuffer(file);
    });
  }
  function readText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || "")); };
      r.onerror = function () { reject(new Error("Could not read the file.")); };
      r.readAsText(file);
    });
  }

  function clean(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_CHARS);
  }

  async function extractPdf(file) {
    await loadScript(PDFJS_URL);
    var pdfjsLib = window.pdfjsLib || (window.pdfjs && window.pdfjs);
    if (!pdfjsLib) throw new Error("PDF parser unavailable.");
    try { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (e) {}
    var buf = await readArrayBuffer(file);
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var out = [];
    var pages = Math.min(pdf.numPages, 12); // cap pages for cost/perf
    for (var i = 1; i <= pages; i++) {
      // eslint-disable-next-line no-await-in-loop
      var page = await pdf.getPage(i);
      // eslint-disable-next-line no-await-in-loop
      var content = await page.getTextContent();
      out.push(content.items.map(function (it) { return it.str; }).join(" "));
    }
    return out.join("\n");
  }

  async function extractDocx(file) {
    await loadScript(MAMMOTH_URL);
    if (!window.mammoth) throw new Error("DOCX parser unavailable.");
    var buf = await readArrayBuffer(file);
    var res = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return (res && res.value) || "";
  }

  function extType(file) {
    var name = (file && file.name || "").toLowerCase();
    var type = (file && file.type || "").toLowerCase();
    if (type.indexOf("pdf") !== -1 || /\.pdf$/.test(name)) return "pdf";
    if (type.indexOf("word") !== -1 || type.indexOf("officedocument") !== -1 || /\.docx?$/.test(name)) return "docx";
    if (type.indexOf("text") !== -1 || /\.(txt|md)$/.test(name)) return "txt";
    return null;
  }

  /**
   * Extract text from a resume file. Resolves { text, meta:{fileName,fileType,chars} }.
   * Rejects with a user-facing Error message on any failure.
   */
  async function extract(file) {
    if (!file) throw new Error("No file selected.");
    if (file.size > MAX_BYTES) throw new Error("That file is larger than 8 MB. Please upload a smaller resume.");
    var kind = extType(file);
    if (!kind) throw new Error("Unsupported file. Upload a PDF, DOCX, or TXT resume.");

    var raw = "";
    if (kind === "pdf") raw = await extractPdf(file);
    else if (kind === "docx") raw = await extractDocx(file);
    else raw = await readText(file);

    var text = clean(raw);
    if (text.length < 40) {
      throw new Error("Couldn't read enough text from that file. If it's a scanned PDF, paste your resume text instead.");
    }
    return {
      text: text,
      meta: { fileName: file.name || "resume", fileType: kind, chars: text.length },
    };
  }

  window.OfferReadyResume = { extract: extract, MAX_CHARS: MAX_CHARS };
})();
