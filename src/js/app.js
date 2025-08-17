document.addEventListener('DOMContentLoaded', () => {
    const cycleModelBtn = document.getElementById('cycle-model-btn');
    const modelNickname = document.getElementById('model-nickname');
    const settingsBtn = document.getElementById('settings-btn');
    const chatContainer = document.getElementById('chat-container');
    const resizeHandle = document.getElementById('resize-handle');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const settingsModal = document.getElementById('settings-modal');
    const llmConfigsContainer = document.getElementById('llm-configs-container');
    const addModelBtn = document.getElementById('add-model-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const importSettingsBtn = document.getElementById('import-settings-btn');
    const exportSettingsBtn = document.getElementById('export-settings-btn');
    const copyChatBtn = document.getElementById('copy-chat-btn');
    const footer = document.querySelector('footer');
    const attachFileBtn = document.getElementById('attach-file-btn');
    const attachedFilesContainer = document.getElementById('attached-files-container');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    let attachedFiles = [];
    let editingMessageId = null;
    let selectedMessage = null;

    const chatView = new window.ChatView(chatContainer);

    chatContainer.addEventListener('message-selected', (e) => {
        const { messageElement, x, y } = e.detail;
        if (selectedMessage) {
            removeMessageControls();
        }
        selectedMessage = messageElement;
        showMessageControls(messageElement, x, y);
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

    const showMessageControls = async (messageElement, x, y) => {
        const controls = document.createElement('div');
        controls.className = 'message-controls absolute bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 flex space-x-2';
        const messageId = parseInt(messageElement.dataset.id);

        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.addEventListener('click', async () => {
            const message = await window.chatAPI.getMessage(messageId);
            messageInput.value = message.content;
            attachedFiles = message.files || [];
            editingMessageId = messageId;
            renderAttachedFiles();
            cancelEditBtn.classList.remove('hidden');
            sendBtn.textContent = '💾';
            removeMessageControls();
            messageInput.focus();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete this message?')) {
                await window.chatAPI.removeMessage(messageId);
                chatView.removeMessage(messageId);
            }
            removeMessageControls();
        });

        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋';
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(messageElement.textContent).then(() => {
                alert('Message copied to clipboard!');
            }, () => {
                alert('Failed to copy message.');
            });
            removeMessageControls();
        });

        const regenerateBtn = document.createElement('button');
        regenerateBtn.textContent = '🔄️';
        regenerateBtn.addEventListener('click', async () => {
            const messages = await window.chatAPI.getMessages();
            const messageIndex = messages.findIndex(m => m.id === messageId);
            const clickedMessage = messages[messageIndex];

            let newMessages;
            if (clickedMessage.sender === 'User') {
                newMessages = messages.slice(0, messageIndex + 1);
            } else { // Assistant message
                newMessages = messages.slice(0, messageIndex);
            }

            window.chatAPI.messages = newMessages;
            await window.db.clearMessages();
            for (const msg of newMessages) {
                await window.db.addMessage(msg);
            }
            
            const scrollTop = chatContainer.scrollTop;
            chatView.renderMessages(newMessages);
            chatContainer.scrollTop = scrollTop;

            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.sender === 'User') {
                removeMessageControls();
                sendBtn.disabled = true;

                const pendingMessage = { sender: 'Assistant', content: '...', id: -1 };
                chatView.appendMessage(pendingMessage);

                const response = await window.chatAPI.sendMessage(newMessages);
                
                chatView.removeMessage(-1);

                if (response) {
                    chatView.appendMessage(response);
                }
                sendBtn.disabled = false;
                messageInput.focus();
            }
        });

        controls.appendChild(editBtn);
        controls.appendChild(deleteBtn);
        controls.appendChild(copyBtn);
        controls.appendChild(regenerateBtn);

        controls.style.visibility = 'hidden';
        document.body.appendChild(controls);

        const rect = controls.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let newX = x;
        let newY = y;

        if (x + rect.width > viewportWidth) {
            newX = viewportWidth - rect.width - 5;
        }
        if (y + rect.height > viewportHeight) {
            newY = viewportHeight - rect.height - 5;
        }
        
        if (newX < 0) newX = 5;
        if (newY < 0) newY = 5;

        controls.style.left = `${newX}px`;
        controls.style.top = `${newY}px`;
        controls.style.visibility = 'visible';
    };

    const removeMessageControls = () => {
        const controls = document.querySelector('.message-controls');
        if (controls) {
            controls.remove();
        }
        if (selectedMessage) {
            selectedMessage = null;
        }
    };

    const renderLlmConfigs = () => {
        llmConfigsContainer.innerHTML = '';
        window.chatAPI.getModels().forEach((model, index) => {
            const configDiv = document.createElement('div');
            configDiv.className = 'mb-4 p-4 border border-black rounded-lg dark:border-black';
            configDiv.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-lg font-semibold">${model.nickname}</h3>
                    <button type="button" class="remove-model-btn text-xl" data-index="${index}">➖</button>
                </div>
                <input type="text" value="${model.endpoint}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Endpoint URL">
                <div class="model-name-container" style="display: ${model.apiSchema === 'google' ? 'none' : 'block'}">
                    <input type="text" value="${model.model}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Model Name">
                </div>
                <input type="text" value="${model.nickname}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Nickname">
                <textarea class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="System Prompt">${model.system_prompt}</textarea>
                <input type="password" value="${model.apiKey || ''}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="API Key">
                <input type="number" step="0.1" value="${model.temperature}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Temperature">
                <input type="number" value="${model.maxOutputTokens || ''}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Max Output Tokens">
                <input type="number" value="${model.thinkingBudget ?? ''}" class="w-full p-2 mt-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Thinking Budget (tokens)">
                <select class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600 api-schema" placeholder="API Schema">
                    <option value="openai" ${model.apiSchema === 'openai' ? 'selected' : ''}>OpenAI</option>
                    <option value="google" ${model.apiSchema === 'google' ? 'selected' : ''}>Google</option>
                </select>
                <div class="google-search-container" style="display: ${model.apiSchema === 'google' ? 'block' : 'none'}">
                    <div class="flex items-center mt-2">
                        <input type="checkbox" id="google-search-checkbox-${index}" class="mr-2" ${model.useGoogleSearch ? 'checked' : ''}>
                        <label for="google-search-checkbox-${index}">Enable Google Search</label>
                    </div>
                    <div class="flex items-center mt-2">
                        <input type="checkbox" id="prepend-system-prompt-checkbox-${index}" class="mr-2" ${model.prependSystemPrompt ? 'checked' : ''}>
                        <label for="prepend-system-prompt-checkbox-${index}">Prepend System Prompt</label>
                    </div>
                </div>
            `;
            llmConfigsContainer.appendChild(configDiv);
        });

        document.querySelectorAll('.remove-model-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = e.target.dataset.index;
                window.chatAPI.removeModel(index);
                renderLlmConfigs();
            });
        });

        document.querySelectorAll('.api-schema').forEach(select => {
            select.addEventListener('change', (e) => {
                const configDiv = e.target.closest('.mb-4');
                const googleSearchContainer = configDiv.querySelector('.google-search-container');
                const modelNameContainer = configDiv.querySelector('.model-name-container');
                if (e.target.value === 'google') {
                    googleSearchContainer.style.display = 'block';
                    modelNameContainer.style.display = 'none';
                } else {
                    googleSearchContainer.style.display = 'none';
                    modelNameContainer.style.display = 'block';
                }
            });
        });
    };

    cycleModelBtn.addEventListener('click', () => {
        const newModel = window.chatAPI.cycleModel();
        modelNickname.textContent = newModel.nickname;
    });

    settingsBtn.addEventListener('click', () => {
        renderLlmConfigs();
        settingsModal.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    addModelBtn.addEventListener('click', () => {
        window.chatAPI.addModel({
            endpoint: '',
            apiKey: '',
            model: '',
            nickname: 'New Model',
            temperature: 0.7,
            system_prompt: 'You are a helpful assistant.',
            apiSchema: 'openai',
            maxOutputTokens: 2048
        });
        renderLlmConfigs();
    });

    saveSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const newModels = Array.from(llmConfigsContainer.children).map(configDiv => {
            return {
                endpoint: configDiv.querySelector('input[placeholder="Endpoint URL"]').value,
                model: configDiv.querySelector('.api-schema').value === 'google' ? '' : configDiv.querySelector('input[placeholder="Model Name"]').value,
                nickname: configDiv.querySelector('input[placeholder="Nickname"]').value,
                apiKey: configDiv.querySelector('input[placeholder="API Key"]').value,
                temperature: parseFloat(configDiv.querySelector('input[placeholder="Temperature"]').value),
                maxOutputTokens: parseInt(configDiv.querySelector('input[placeholder="Max Output Tokens"]').value, 10),
                system_prompt: configDiv.querySelector('textarea').value,
                apiSchema: configDiv.querySelector('.api-schema').value,
                useGoogleSearch: configDiv.querySelector('.api-schema').value === 'google' ? configDiv.querySelector('input[id^="google-search-checkbox-"]').checked : false,
                prependSystemPrompt: configDiv.querySelector('.api-schema').value === 'google' ? configDiv.querySelector('input[id^="prepend-system-prompt-checkbox-"]').checked : false,
                thinkingBudget: configDiv.querySelector('.api-schema').value === 'google' ? parseInt(configDiv.querySelector('input[placeholder="Thinking Budget (tokens)"]').value, 10) : null,
            };
        });
        window.chatAPI.saveModels(newModels);
        settingsModal.classList.add('hidden');
        modelNickname.textContent = window.chatAPI.getCurrentModel().nickname;
    });

    const renderAttachedFiles = () => {
        attachedFilesContainer.innerHTML = '';
        attachedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'attached-file-item';
            const fileName = document.createElement('span');
            fileName.textContent = file.name;
            fileItem.appendChild(fileName);
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-file-btn';
            removeBtn.textContent = '❌';
            removeBtn.addEventListener('click', () => {
                attachedFiles.splice(index, 1);
                renderAttachedFiles();
            });
            fileItem.appendChild(removeBtn);
            attachedFilesContainer.appendChild(fileItem);
        });

        const contentContainer = footer.querySelector('.flex-grow');
        const messageInputMinHeight = 90;
        const contentHeight = contentContainer.scrollHeight;
        const minHeight = contentHeight - messageInput.offsetHeight + messageInputMinHeight;
        if (footer.offsetHeight < minHeight) {
            footer.style.height = `${minHeight}px`;
        }
    };

    attachFileBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.addEventListener('change', (e) => {
            const files = e.target.files;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const reader = new FileReader();
                reader.onload = (e) => {
                    attachedFiles.push({ name: file.name, type: file.type, data: e.target.result });
                    renderAttachedFiles();
                };
                reader.readAsDataURL(file);
            }
        });
        input.click();
    });

    sendBtn.addEventListener('click', async () => {
        const content = messageInput.value.trim();
        if (content || attachedFiles.length > 0) {
            if (editingMessageId !== null) {
                const updatedMessage = await window.chatAPI.updateMessage(editingMessageId, content, attachedFiles);
                chatView.editMessage(updatedMessage);
                editingMessageId = null;
                cancelEditBtn.classList.add('hidden');
                sendBtn.textContent = '▶️';
                messageInput.value = '';
                attachedFiles = [];
                renderAttachedFiles();
            } else {
                const userMessage = { sender: 'User', content, files: attachedFiles };
                const newUserMessage = await window.chatAPI.addMessage(userMessage);
                chatView.appendMessage(newUserMessage);
                messageInput.value = '';
                attachedFiles = [];
                renderAttachedFiles();

                sendBtn.disabled = true;
                const pendingMessage = { sender: 'Assistant', content: '...', id: -1 };
                chatView.appendMessage(pendingMessage);

                const response = await window.chatAPI.sendMessage(await window.chatAPI.getMessages());

                chatView.removeMessage(-1);

                if (response) {
                    chatView.appendMessage(response);
                }
                sendBtn.disabled = false;
            }
        }
    });

    cancelEditBtn.addEventListener('click', () => {
        messageInput.value = '';
        attachedFiles = [];
        editingMessageId = null;
        renderAttachedFiles();
        cancelEditBtn.classList.add('hidden');
        sendBtn.textContent = '▶️';
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            sendBtn.click();
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
            const newHeight = window.innerHeight - clientY;

            const contentContainer = footer.querySelector('.flex-grow');
            const messageInputMinHeight = 90;
            const contentHeight = contentContainer.scrollHeight;
            const minHeight = contentHeight - messageInput.offsetHeight + messageInputMinHeight;

            const maxHeight = 500; // Maximum height for the footer

            if (newHeight >= minHeight && newHeight <= maxHeight) {
                footer.style.height = `${newHeight}px`;
            } else if (newHeight < minHeight) {
                footer.style.height = `${minHeight}px`;
            }
        }
    };

    const stopResize = () => {
        resizing = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    };

    resizeHandle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);

    resizeHandle.addEventListener('touchstart', startResize, { passive: true });
    document.addEventListener('touchmove', doResize);
    document.addEventListener('touchend', stopResize);

    clearChatBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear the chat?')) {
            await window.chatAPI.clearMessages();
            chatView.clear();
        }
    });

    exportSettingsBtn.addEventListener('click', () => {
        const models = window.chatAPI.getModels();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(models, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href",     dataStr);
        downloadAnchorNode.setAttribute("download", "gemini-chat-settings.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    importSettingsBtn.addEventListener('click', () => {
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
                    window.chatAPI.saveModels(newModels);
                    renderLlmConfigs();
                    modelNickname.textContent = window.chatAPI.getCurrentModel().nickname;
                    alert('Settings imported successfully!');
                } catch (error) {
                    alert('Error importing settings: ' + error.message);
                }
            }
            reader.readAsText(file);
        }
        input.click();
    });

    

    // Initial Render
    const init = async () => {
        const currentModel = window.chatAPI.getCurrentModel();
        if (currentModel) {
            modelNickname.textContent = currentModel.nickname;
        } else {
            modelNickname.textContent = 'No Model';
            sendBtn.disabled = true;
        }
        const messages = await window.chatAPI.getMessages();
        chatView.renderMessages(messages);
    };
    init();
});
