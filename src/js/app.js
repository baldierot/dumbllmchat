import { dom } from './dom.js';
import { initializeEventListeners } from './events.js';
import { renderAttachedFiles, updateTokenCountDisplay, populateModelSelector } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    const app = {
        attachedFiles: [],
        editingMessageId: null,
        selectedMessage: null,
        selectedConversationId: null,
        initialFooterHeight: dom.footer.offsetHeight,
        compressionController: null,
        chatView: new window.ChatView(dom.chatContainer),
        chatAPI: window.chatAPI,
    };

    initializeEventListeners(app);

    await app.chatAPI.init();
    
    const currentModel = app.chatAPI.getCurrentModel();
    if (!currentModel) {
        dom.sendBtn.disabled = true;
    }

    await populateModelSelector(app.chatAPI);
    
    const messages = await app.chatAPI.getMessages();
    app.chatView.renderMessages(messages);
    
    if (app.chatAPI.currentWorkflowId) {
        dom.tokenCountDisplay.textContent = 'Workflow';
    } else {
        updateTokenCountDisplay(app.chatAPI);
    }
    
    renderAttachedFiles(app);
});