// jsdom's Blob loses its bytes when structured-cloned by fake-indexeddb; Node's Blob
// survives cloning, so tests use it (browsers store Blobs in IndexedDB natively).
import { Blob as NodeBlob } from 'node:buffer';

globalThis.Blob = NodeBlob;
