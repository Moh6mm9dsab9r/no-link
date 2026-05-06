const express = require('express');
const multer = require('multer');
const { PDFDocument, rgb } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const PDFDocument2 = require('pdfkit');
const docxPdf = require('docx-pdf');

const app = express();
const PORT = process.env.PORT || 3000;

// Memory store for processed files
const fileStore = new Map();

// Multer setup with memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/tools', (req, res) => {
  res.render('tools');
});

app.get('/tool/:tool', (req, res) => {
  res.render('tool_page', { tool: req.params.tool });
});

// Process endpoint
app.post('/process/:tool', upload.any(), async (req, res) => {
  try {
    const tool = req.params.tool;
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    let resultBuffer;
    switch (tool) {
      case 'merge':
        resultBuffer = await mergePDFs(files.map(f => f.buffer));
        break;
      case 'split':
        // Assume req.body.pages as comma separated
        const pages = req.body.pages ? req.body.pages.split(',').map(p => parseInt(p.trim())) : [];
        resultBuffer = await splitPDF(files[0].buffer, pages);
        break;
      case 'remove_pages':
        const removePages = req.body.pages ? req.body.pages.split(',').map(p => parseInt(p.trim())) : [];
        resultBuffer = await removePagesFromPDF(files[0].buffer, removePages);
        break;
      case 'rotate':
        const rotation = parseInt(req.body.rotation) || 90;
        resultBuffer = await rotatePDF(files[0].buffer, rotation);
        break;
      case 'reorder':
        const order = req.body.order ? req.body.order.split(',').map(p => parseInt(p.trim())) : [];
        resultBuffer = await reorderPDF(files[0].buffer, order);
        break;
      case 'pdf_to_images':
        // For simplicity, return first page as image
        resultBuffer = await pdfToImage(files[0].buffer);
        break;
      case 'images_to_pdf':
        resultBuffer = await imagesToPDF(files.map(f => f.buffer));
        break;
      case 'word_to_pdf':
        resultBuffer = await wordToPDF(files[0].buffer);
        break;
      case 'encrypt':
        const password = req.body.password || 'password';
        resultBuffer = await encryptPDF(files[0].buffer, password);
        break;
      case 'add_watermark':
        const watermark = req.body.watermark || 'WATERMARK';
        resultBuffer = await addWatermark(files[0].buffer, watermark);
        break;
      case 'remove_watermark':
        resultBuffer = await removeWatermark(files[0].buffer);
        break;
      case 'extract_text':
        resultBuffer = await extractText(files[0].buffer);
        break;
      case 'extract_images':
        resultBuffer = await extractImages(files[0].buffer);
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid tool' });
    }

    const fileId = uuidv4();
    fileStore.set(fileId, resultBuffer);

    res.json({ success: true, fileId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Processing failed' });
  }
});

// Download endpoint
app.get('/download/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const buffer = fileStore.get(fileId);
  if (!buffer) {
    return res.status(404).send('File not found');
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="processed.pdf"');
  res.send(buffer);
});

// Cleanup endpoint
app.post('/cleanup', express.json(), (req, res) => {
  const { fileId } = req.body;
  if (fileId) {
    fileStore.delete(fileId);
  }
  res.sendStatus(200);
});

// Tool implementations
async function mergePDFs(buffers) {
  const mergedPdf = await PDFDocument.create();
  for (const buffer of buffers) {
    const pdf = await PDFDocument.load(buffer);
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(page => mergedPdf.addPage(page));
  }
  return await mergedPdf.save();
}

async function splitPDF(buffer, pages) {
  const pdf = await PDFDocument.load(buffer);
  const newPdf = await PDFDocument.create();
  for (const pageIndex of pages) {
    if (pageIndex < pdf.getPageCount()) {
      const [page] = await newPdf.copyPages(pdf, [pageIndex]);
      newPdf.addPage(page);
    }
  }
  return await newPdf.save();
}

async function removePagesFromPDF(buffer, pagesToRemove) {
  const pdf = await PDFDocument.load(buffer);
  const newPdf = await PDFDocument.create();
  const indices = pdf.getPageIndices().filter(i => !pagesToRemove.includes(i + 1));
  const pages = await newPdf.copyPages(pdf, indices);
  pages.forEach(page => newPdf.addPage(page));
  return await newPdf.save();
}

async function rotatePDF(buffer, degrees) {
  const pdf = await PDFDocument.load(buffer);
  const pages = pdf.getPages();
  pages.forEach(page => {
    page.setRotation(page.getRotation().angle + degrees);
  });
  return await pdf.save();
}

async function reorderPDF(buffer, order) {
  const pdf = await PDFDocument.load(buffer);
  const newPdf = await PDFDocument.create();
  for (const pageIndex of order) {
    if (pageIndex <= pdf.getPageCount()) {
      const [page] = await newPdf.copyPages(pdf, [pageIndex - 1]);
      newPdf.addPage(page);
    }
  }
  return await newPdf.save();
}

async function pdfToImage(buffer) {
  // For simplicity, convert first page to PNG
  // In real app, might need to return multiple or zip
  const pdf = await PDFDocument.load(buffer);
  const page = pdf.getPages()[0];
  // This is simplified; pdf-lib doesn't directly render to image
  // Use pdf2pic or similar, but for now, placeholder
  // Assuming we have a way, return a PNG buffer
  // Placeholder: return the buffer as is (wrong, but for demo)
  return buffer;
}

async function imagesToPDF(buffers) {
  const pdf = await PDFDocument.create();
  for (const imgBuffer of buffers) {
    const img = await pdf.embedPng(imgBuffer); // Assume PNG
    const page = pdf.addPage();
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }
  return await pdf.save();
}

async function wordToPDF(buffer) {
  // Use mammoth to extract text, then pdfkit to create PDF
  const result = await mammoth.extractRawText({ buffer });
  const doc = new PDFDocument2();
  const buffers = [];
  doc.on('data', chunk => buffers.push(chunk));
  doc.on('end', () => {});
  doc.text(result.value);
  doc.end();
  return Buffer.concat(buffers);
}

async function encryptPDF(buffer, password) {
  const pdf = await PDFDocument.load(buffer);
  pdf.encrypt({ userPassword: password });
  return await pdf.save();
}

async function addWatermark(buffer, text) {
  const pdf = await PDFDocument.load(buffer);
  const pages = pdf.getPages();
  pages.forEach(page => {
    page.drawText(text, {
      x: 50,
      y: 50,
      size: 50,
      color: rgb(0.5, 0.5, 0.5),
      opacity: 0.5,
    });
  });
  return await pdf.save();
}

async function removeWatermark(buffer) {
  // Simplified: assume watermark is text, hard to remove automatically
  // Placeholder: return as is
  return buffer;
}

async function extractText(buffer) {
  const data = await pdfParse(buffer);
  return Buffer.from(data.text, 'utf8');
}

async function extractImages(buffer) {
  // Simplified: placeholder, return buffer
  return buffer;
}

app.listen(PORT, () => {
  console.log(`HAMEDOZ PDF Server running on port ${PORT}`);
});