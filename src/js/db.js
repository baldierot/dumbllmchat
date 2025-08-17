const DB_NAME = 'dumbllmchat_db';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

let db;

function openDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            reject('Error opening IndexedDB');
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        };
    });
}

async function getMessages() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onerror = (event) => {
            reject('Error getting messages from IndexedDB');
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
    });
}

async function addMessage(message) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(message);

        request.onerror = (event) => {
            reject('Error adding message to IndexedDB');
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
    });
}

async function updateMessage(message) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(message);

        request.onerror = (event) => {
            reject('Error updating message in IndexedDB');
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
    });
}

async function removeMessage(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onerror = (event) => {
            reject('Error removing message from IndexedDB');
        };

        request.onsuccess = (event) => {
            resolve();
        };
    });
}

async function clearMessages() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = (event) => {
            reject('Error clearing messages from IndexedDB');
        };

        request.onsuccess = (event) => {
            resolve();
        };
    });
}

window.db = {
    getMessages,
    addMessage,
    updateMessage,
    removeMessage,
    clearMessages
};