// Ponto único de entrada da biblioteca de detecção. O código vive em
// src/vendor/ (cópia MIT do js-aruco2) para não depender do interop CommonJS
// do bundler, que muda de comportamento entre versões.
export { AR } from './vendor/aruco.js';
