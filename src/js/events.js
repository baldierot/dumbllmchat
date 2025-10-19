import { dom } from './dom.js';
import { showMessageControls, removeMessageControls, renderConversations, updateTokenCountDisplay, renderLlmConfigs, renderAttachedFiles } from './ui.js';

export function initializeEventListeners(app) {
    dom.chatContainer.addEventListener('message-selected', (e) => {
        const { messageElement, x, y } = e.detail;
        if (app.selectedMessage) {
            removeMessageControls();
        }
        app.selectedMessage = messageElement;
        showMessageControls(messageElement, x, y, app);
    });

    document.addEventListener('click', (e) => {
        const controls = document.querySelector('.message-controls');
        if (!controls) return;

        const clickedMessage = e.target.closest('[data-id]');
        const clickedControls = e.target.closest('.message-controls');

        if (!clickedMessage && !clickedControls) {
            removeMessageControls();
        }
    });

    dom.historyBtn.addEventListener('click', async () => {
        await renderConversations(app);
        dom.historyModal.classList.remove('hidden');
    });

    dom.closeHistoryBtn.addEventListener('click', () => {
        dom.historyModal.classList.add('hidden');
    });

    dom.addConversationBtn.addEventListener('click', async () => {
        const newConversation = await app.chatAPI.addConversation({ name: 'New Conversation', timestamp: Date.now() });
        await app.chatAPI.switchConversation(newConversation.id);
        app.chatView.clear();
        await renderConversations(app);
        updateTokenCountDisplay(app.chatAPI);
    });

    dom.loadConversationBtn.addEventListener('click', async () => {
        if (app.selectedConversationId !== null) {
            await app.chatAPI.switchConversation(app.selectedConversationId);
            const messages = await app.chatAPI.getMessages();
            app.chatView.renderMessages(messages);
            dom.historyModal.classList.add('hidden');
            updateTokenCountDisplay(app.chatAPI);

            const lastMessage = app.chatView.chatContainer.lastElementChild;
            if (lastMessage) {
                lastMessage.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });

    dom.renameConversationBtn.addEventListener('click', async () => {
        if (app.selectedConversationId !== null) {
            const conversation = app.chatAPI.conversations.find(c => c.id === app.selectedConversationId);
            const newName = prompt('Enter new conversation name:', conversation.name);
            if (newName && newName.trim() !== '') {
                conversation.name = newName;
                await app.chatAPI.updateConversation(conversation);
                const renamedConversationId = app.selectedConversationId;
                await renderConversations(app);
                const renamedConversationLi = dom.conversationsContainer.querySelector(`[data-id='${renamedConversationId}']`);
                if (renamedConversationLi) {
                    setTimeout(() => {
                        renamedConversationLi.click();
                        renamedConversationLi.scrollIntoView({ block: 'nearest' });
                    }, 0);
                }
            }
        }
    });

    dom.deleteConversationBtn.addEventListener('click', async () => {
        if (app.selectedConversationId !== null && confirm('Are you sure you want to delete this conversation?')) {
            let conversations = await app.chatAPI.getConversations();
            conversations.reverse();
            const deletedConversationIndex = conversations.findIndex(c => c.id === app.selectedConversationId);

            await app.chatAPI.deleteConversation(app.selectedConversationId);

            let updatedConversations = await app.chatAPI.getConversations();
            updatedConversations.reverse();

            if (updatedConversations.length > 0) {
                let nextConversationIndex = deletedConversationIndex;
                if (nextConversationIndex >= updatedConversations.length) {
                    nextConversationIndex = updatedConversations.length - 1;
                }
                await app.chatAPI.switchConversation(updatedConversations[nextConversationIndex].id);
            } else {
                await app.chatAPI.addConversation({ name: 'New Conversation', timestamp: Date.now() });
            }

            const messages = await app.chatAPI.getMessages();
            app.chatView.renderMessages(messages);
            await renderConversations(app);
            updateTokenCountDisplay(app.chatAPI);
        }
    });

    dom.compressConversationBtn.addEventListener('click', async () => {
        if (app.compressionController) {
            app.compressionController.abort();
            app.compressionController = null;
            dom.compressConversationBtn.textContent = '📦';
            return;
        }

        if (app.selectedConversationId !== null) {
            if (confirm('Are you sure you want to compress this conversation?')) {
                app.compressionController = new AbortController();
                const signal = app.compressionController.signal;

                dom.compressConversationBtn.textContent = '📦...';

                const progressCallback = (currentPass, totalPasses) => {
                    dom.compressConversationBtn.textContent = `📦 ${currentPass}/${totalPasses}`;
                };

                try {
                    await app.chatAPI.compressConversation(app.selectedConversationId, progressCallback, signal);
                    await renderConversations(app);
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        alert('Error compressing conversation: ' + error.message);
                    } else {
                        alert('Compression cancelled.');
                        await renderConversations(app);
                    }
                } finally {
                    app.compressionController = null;
                    dom.compressConversationBtn.textContent = '📦';
                }
            }
        }
    });

    dom.exportConversationBtn.addEventListener('click', async () => {
        if (app.selectedConversationId !== null) {
            const conversation = app.chatAPI.conversations.find(c => c.id === app.selectedConversationId);
            const messages = await window.db.getMessages(app.selectedConversationId);
            const conversationData = { ...conversation, messages };

            let title = conversation.name;
            if (!title && messages.length > 0) {
                title = messages[0].content.split('\n')[0];
            }
            const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(conversationData, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href",     dataStr);
            downloadAnchorNode.setAttribute("download", `${sanitizedTitle}.json`);
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        }
    });

    dom.importConversationBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = async readerEvent => {
                try {
                    const content = readerEvent.target.result;
                    const conversationData = JSON.parse(content);
                    await window.db.importConversation(conversationData);
                    await renderConversations(app);
                    alert('Conversation imported successfully!');
                } catch (error) {
                    alert('Error importing conversation: ' + error.message);
                }
            }
            reader.readAsText(file);
        }
        input.click();
    });

    dom.cycleModelBtn.addEventListener('click', () => {
        const newModel = app.chatAPI.cycleModel();
        dom.modelNickname.textContent = newModel.nickname;
        updateTokenCountDisplay(app.chatAPI);
    });

    dom.settingsBtn.addEventListener('click', () => {
        renderLlmConfigs(app.chatAPI);
        dom.settingsModal.classList.remove('hidden');
    });

    dom.closeSettingsBtn.addEventListener('click', () => {
        dom.settingsModal.classList.add('hidden');
    });

    dom.addModelBtn.addEventListener('click', () => {
        app.chatAPI.addModel({
            modelName: 'gemini-2.5-flash-lite',
            apiKey: '',
            nickname: 'New Model',
            temperature: 0.7,
            system_prompt: 'You are a helpful assistant.',
            maxOutputTokens: 8192,
            proxy: ''
        });
        renderLlmConfigs(app.chatAPI);
    });

    dom.saveSettingsBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const newModels = Array.from(dom.llmConfigsContainer.children).map(configDiv => {
            return {
                modelName: configDiv.querySelector('input[placeholder="Model Name"]').value,
                nickname: configDiv.querySelector('input[placeholder="Nickname"]').value,
                apiKey: configDiv.querySelector('input[placeholder="API Key"]').value,
                temperature: parseFloat(configDiv.querySelector('input[placeholder="Temperature"]').value),
                maxOutputTokens: parseInt(configDiv.querySelector('input[placeholder="Max Output Tokens"]').value, 10),
                proxy: configDiv.querySelector('input[placeholder="Proxy URL"]').value,
                system_prompt: configDiv.querySelector('textarea').value,
                useGoogleSearch: configDiv.querySelector('input[id^="google-search-checkbox-"]').checked,
                useUrlContext: configDiv.querySelector('input[id^="url-context-checkbox-"]').checked,
                prependSystemPrompt: configDiv.querySelector('input[id^="prepend-system-prompt-checkbox-"]').checked,
                thinkingBudget: parseInt(configDiv.querySelector('input[placeholder="Thinking Budget (tokens)"]').value, 10),
            };
        });
        await app.chatAPI.saveModels(newModels);
        dom.settingsModal.classList.add('hidden');
        dom.modelNickname.textContent = app.chatAPI.getCurrentModel().nickname;
        updateTokenCountDisplay(app.chatAPI);
    });

    dom.attachFileBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.addEventListener('change', (e) => {
            const files = e.target.files;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const reader = new FileReader();
                reader.onload = (e) => {
                    app.attachedFiles.push({ name: file.name, type: file.type, data: e.target.result });
                    renderAttachedFiles(app);
                };
                reader.readAsDataURL(file);
            }
        });
        input.click();
    });

    dom.sendBtn.addEventListener('click', async () => {
        const content = dom.messageInput.value.trim();
        if (content || app.attachedFiles.length > 0) {
            if (app.editingMessageId !== null) {
                const updatedMessage = await app.chatAPI.updateMessage(app.editingMessageId, content, app.attachedFiles);
                app.chatView.editMessage(updatedMessage);
                app.editingMessageId = null;
                dom.cancelEditBtn.classList.add('hidden');
                dom.sendBtn.textContent = '▶️';
                dom.messageInput.value = '';
                app.attachedFiles = [];
                renderAttachedFiles(app);
            } else {
                const userMessage = { sender: 'User', content, files: app.attachedFiles };
                const newUserMessage = await app.chatAPI.addMessage(userMessage);
                app.chatView.appendMessage(newUserMessage);
                dom.messageInput.value = '';
                app.attachedFiles = [];
                renderAttachedFiles(app);

                dom.sendBtn.disabled = true;
                const pendingMessage = { sender: 'Assistant', content: '...', id: -1 };
                app.chatView.appendMessage(pendingMessage);

                try {
                    const response = await app.chatAPI.sendMessage(await app.chatAPI.getMessages());
                    app.chatView.removeMessage(-1);
                    if (response) {
                        app.chatView.appendMessage(response);
                    }
                } catch (error) {
                    app.chatView.removeMessage(-1);
                    const errorMessage = { sender: 'Error', content: `An error occurred: ${error.message}`, id: Date.now() };
                    app.chatView.appendMessage(errorMessage);
                } finally {
                    dom.sendBtn.disabled = false;
                    updateTokenCountDisplay(app.chatAPI);
                }
            }
        }
    });

    dom.cancelEditBtn.addEventListener('click', () => {
        dom.messageInput.value = '';
        app.attachedFiles = [];
        app.editingMessageId = null;
        renderAttachedFiles(app);
        dom.cancelEditBtn.classList.add('hidden');
        dom.sendBtn.textContent = '▶️';
    });

    dom.messageInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            dom.sendBtn.click();
        }
    });

    let resizing = false;
    const startResize = (e) => {
        resizing = true;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'row-resize';
    };

    const doResize = (e) => {
        if (resizing) {
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            if (clientY === undefined) return;
            let newHeight = window.innerHeight - clientY;

            const minHeight = app.initialFooterHeight + dom.attachedFilesContainer.offsetHeight;
            const maxHeight = 500; // Maximum height for the footer

            if (newHeight < minHeight) {
                newHeight = minHeight;
            }

            if (newHeight > maxHeight) {
                newHeight = maxHeight;
            }

            dom.footer.style.height = `${newHeight}px`;
        }
    };

    const stopResize = () => {
        resizing = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    };

    dom.resizeHandle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);

    dom.resizeHandle.addEventListener('touchstart', startResize, { passive: true });
    document.addEventListener('touchmove', doResize);
    document.addEventListener('touchend', stopResize);

    dom.clearChatBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear the chat?')) {
            await app.chatAPI.clearMessages();
            app.chatView.clear();
            updateTokenCountDisplay(app.chatAPI);
        }
    });

    dom.exportSettingsBtn.addEventListener('click', () => {
        const models = app.chatAPI.getModels();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(models, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href",     dataStr);
        downloadAnchorNode.setAttribute("download", "gemini-chat-settings.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    dom.importSettingsBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = readerEvent => {
                try {
                    const content = readerEvent.target.result;
                    const newModels = JSON.parse(content);
                    app.chatAPI.saveModels(newModels);
                    renderLlmConfigs(app.chatAPI);
                    dom.modelNickname.textContent = app.chatAPI.getCurrentModel().nickname;
                    alert('Settings imported successfully!');
                } catch (error) {
                    alert('Error importing settings: ' + error.message);
                }
            }
            reader.readAsText(file);
        }
        input.click();
    });
}
