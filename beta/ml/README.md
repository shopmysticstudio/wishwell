# On-phone text matcher (beta only)

Files served from this site so the phone never sends text anywhere to match it:

- `text_bundle.mjs` and `wasm/`: MediaPipe Tasks Text 1.2.3 from npm (`@mediapipe/tasks-text`), Apache License 2.0, by Google.
- `use.tflite`: the Universal Sentence Encoder text embedder model from MediaPipe's model page
  (storage.googleapis.com/mediapipe-models/text_embedder/universal_sentence_encoder/float32/latest), Apache License 2.0.
  SHA-256 89ad3c74175dd8caa398cc22b657296d94302d20c525c12b58b29420f7249749.

`../smart.js` loads them only on /beta, after a beta code is entered, and not when the browser asks to save data.
The model turns a short text into 100 numbers; similar meanings get similar numbers. Everything runs on the phone.
