# Invoice OCR runtime

Public runtime assets are copied from the pinned npm dependencies by
`scripts/sync-invoice-ocr-assets.mjs` before development and production builds.
They contain no uploaded documents, customer data, or API credentials.

- Tesseract.js 7.0.0 and Tesseract.js-core 7.0.0: Apache-2.0,
  https://github.com/naptha/tesseract.js and https://github.com/naptha/tesseract.js-core
- PDF.js (`pdfjs-dist` 6.2.108): Apache-2.0, https://github.com/mozilla/pdf.js
- English LSTM language data: `@tesseract.js-data/eng@1.0.0`,
  `4.0.0_best_int/eng.traineddata.gz`, Apache-2.0,
  https://github.com/naptha/tessdata
  Source: https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz
  SHA-256: `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91`

The language archive is checked into the repository so deployed browsers fetch
the motor and language only from this application. There is no OCR API request.
