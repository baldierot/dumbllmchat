const DB_NAME = 'dumbllmchat_db';
const DB_VERSION = 2;
const MESSAGES_STORE_NAME = 'messages';
const CONVERSATIONS_STORE_NAME = 'conversations';

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
            if (!db.objectStoreNames.contains(CONVERSATIONS_STORE_NAME)) {
                db.createObjectStore(CONVERSATIONS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(MESSAGES_STORE_NAME)) {
                const messagesStore = db.createObjectStore(MESSAGES_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                messagesStore.createIndex('conversationId', 'conversationId', { unique: false });
            } else {
                const transaction = event.target.transaction;
                const messagesStore = transaction.objectStore(MESSAGES_STORE_NAME);
                if (!messagesStore.indexNames.contains('conversationId')) {
                    messagesStore.createIndex('conversationId', 'conversationId', { unique: false });
                }
            }
        };
    });
}

async function getConversations() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATIONS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONVERSATIONS_STORE_NAME);
        const request = store.getAll();

        request.onerror = (event) => {
            reject('Error getting conversations from IndexedDB');
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
    });
}

async function addConversation(conversation) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATIONS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONVERSATIONS_STORE_NAME);
        const request = store.add(conversation);

        request.onerror = (event) => {
            reject('Error adding conversation to IndexedDB');
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
    });
}

async function updateConversation(conversation) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATIONS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONVERSATIONS_STORE_NAME);
        const request = store.put(conversation);

        request.onerror = (event) => {
            reject('Error updating conversation in IndexedDB');
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
    });
}

async function deleteConversation(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONVERSATIONS_STORE_NAME, MESSAGES_STORE_NAME], 'readwrite');
        const conversationsStore = transaction.objectStore(CONVERSATIONS_STORE_NAME);
        const messagesStore = transaction.objectStore(MESSAGES_STORE_NAME);

        conversationsStore.delete(id);

        const index = messagesStore.index('conversationId');
        const request = index.openCursor(IDBKeyRange.only(id));

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = (event) => {
            reject('Error deleting conversation from IndexedDB');
        };
    });
}

async function getMessages(conversationId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE_NAME], 'readonly');
        const store = transaction.objectStore(MESSAGES_STORE_NAME);
        const index = store.index('conversationId');
        const request = index.getAll(conversationId);

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
        const transaction = db.transaction([MESSAGES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(MESSAGES_STORE_NAME);
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
        const transaction = db.transaction([MESSAGES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(MESSAGES_STORE_NAME);
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
        const transaction = db.transaction([MESSAGES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(MESSAGES_STORE_NAME);
        const request = store.delete(id);

        request.onerror = (event) => {
            reject('Error removing message from IndexedDB');
        };

        request.onsuccess = (event) => {
            resolve();
        };
    });
}

async function clearMessages(conversationId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(MESSAGES_STORE_NAME);
        const index = store.index('conversationId');
        const request = index.openCursor(IDBKeyRange.only(conversationId));

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = (event) => {
            reject('Error clearing messages from IndexedDB');
        };
    });
}

async function importConversation(conversationData) {
    const { messages, ...conversation } = conversationData;
    delete conversation.id;
    const newConversationId = await addConversation(conversation);
    for (const message of messages) {
        delete message.id;
        message.conversationId = newConversationId;
        await addMessage(message);
    }
}

window.db = {
    getConversations,
    addConversation,
    updateConversation,
    deleteConversation,
    getMessages,
    addMessage,
    updateMessage,
    removeMessage,
    clearMessages,
    importConversation
};