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

    let selectedMessage = null;

    document.addEventListener('click', (e) => {
        const controls = document.querySelector('.message-controls');
        if (!controls) return;

        const clickedMessage = e.target.closest('[data-index]');
        const clickedControls = e.target.closest('.message-controls');

        if (!clickedMessage && !clickedControls) {
            removeMessageControls();
        }
    });

    const renderMessages = () => {
        chatContainer.innerHTML = '';
        let lastMessageElement = null;
        window.chatAPI.getMessages().forEach((msg, index) => {
            const messageElement = createMessageElement(msg, index);
            chatContainer.appendChild(messageElement);
            lastMessageElement = messageElement;
        });
        // if (lastMessageElement) {
        //     lastMessageElement.scrollIntoView({ behavior: 'smooth' });
        // }
    };

    const createMessageElement = (msg, index) => {
        const div = document.createElement('div');
        let bgColor = 'bg-gray-300 dark:bg-gray-700';
        let alignClass = 'self-start';
        if (msg.sender === 'User') {
            bgColor = 'bg-blue-500 text-white';
            alignClass = 'self-end';
        } else if (msg.sender === 'Error') {
            bgColor = 'bg-red-500 text-white';
        }

        div.className = `p-3 rounded-lg ${bgColor} w-full ${alignClass} message`;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = marked.parse(msg.content, { breaks: true });
        div.appendChild(messageContent);

        div.dataset.index = index;

        div.querySelectorAll('pre').forEach(pre => {
            const code = pre.querySelector('code');
            const language = code.className.split('-')[1] || '';

            const container = document.createElement('div');
            container.className = 'code-block-container';

            const header = document.createElement('div');
            header.className = 'code-block-header';

            const languageLabel = document.createElement('span');
            languageLabel.textContent = language;
            header.appendChild(languageLabel);

            const copyBtn = document.createElement('button');
            copyBtn.textContent = 'Copy';
            copyBtn.className = 'copy-code-btn';
            header.appendChild(copyBtn);

            container.appendChild(header);
            container.appendChild(pre.cloneNode(true));
            pre.replaceWith(container);

            hljs.highlightElement(container.querySelector('pre code'));

            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const codeToCopy = code.innerText;
                navigator.clipboard.writeText(codeToCopy).then(() => {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy';
                    }, 2000);
                }, () => {
                    alert('Failed to copy code.');
                });
            });
        });

        if (msg.sender !== 'Error') {
            div.addEventListener('click', (e) => {
                if (selectedMessage) {
                    removeMessageControls();
                }
                selectedMessage = div;
                showMessageControls(div, e.clientX, e.clientY);
            });
        }

        return div;
    };

    const showMessageControls = (messageElement, x, y) => {
        const controls = document.createElement('div');
        controls.className = 'message-controls absolute bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 flex space-x-2';

        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.addEventListener('click', () => {
            const index = messageElement.dataset.index;
            const messageContent = messageElement.querySelector('.message-content');
            const originalContent = window.chatAPI.getMessages()[index].content;

            const editContainer = document.createElement('div');
            editContainer.className = 'w-full';

            const textarea = document.createElement('textarea');
            textarea.className = 'w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 resize-y text-black dark:text-white';
            textarea.value = originalContent;
            
            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.className = 'bg-blue-500 text-white px-4 py-2 rounded-lg mt-2';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.className = 'bg-gray-500 text-white px-4 py-2 rounded-lg mt-2 ml-2';

            editContainer.appendChild(textarea);
            editContainer.appendChild(saveBtn);
            editContainer.appendChild(cancelBtn);

            messageContent.innerHTML = '';
            messageContent.appendChild(editContainer);
            textarea.focus();

            editContainer.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    saveBtn.click();
                }
            });

            saveBtn.addEventListener('click', () => {
                const newContent = textarea.value;
                if (newContent) {
                    window.chatAPI.updateMessage(index, newContent);
                    const newMessageElement = createMessageElement(window.chatAPI.getMessages()[index], index);
                    messageElement.replaceWith(newMessageElement);
                }
            });

            cancelBtn.addEventListener('click', () => {
                const originalMessageElement = createMessageElement(window.chatAPI.getMessages()[index], index);
                messageElement.replaceWith(originalMessageElement);
            });

            removeMessageControls();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this message?')) {
                window.chatAPI.removeMessage(messageElement.dataset.index);
                renderMessages();
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
            const index = parseInt(messageElement.dataset.index);
            const messages = window.chatAPI.getMessages();
            const clickedMessage = messages[index];

            let newMessages;
            if (clickedMessage.sender === 'User') {
                newMessages = messages.slice(0, index + 1);
            } else { // Assistant message
                newMessages = messages.slice(0, index);
            }

            window.chatAPI.messages = newMessages;
            window.chatAPI.saveMessages();
            renderMessages();

            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.sender === 'User') {
                removeMessageControls();
                sendBtn.disabled = true;

                const pendingMessage = { sender: 'Assistant', content: '...' };
                const pendingDiv = createMessageElement(pendingMessage, -1);
                chatContainer.appendChild(pendingDiv);
                chatContainer.scrollTop = chatContainer.scrollHeight;

                const response = await window.chatAPI.sendMessage(newMessages);

                chatContainer.removeChild(pendingDiv);

                if (response) {
                    renderMessages();
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

    sendBtn.addEventListener('click', async () => {
        const content = messageInput.value.trim();
        if (content) {
            messageInput.value = '';
            sendBtn.disabled = true;

            const userMessage = { sender: 'User', content };
            window.chatAPI.addMessage(userMessage);
            renderMessages();

            const pendingMessage = { sender: 'Assistant', content: '...' };
            const pendingDiv = createMessageElement(pendingMessage, -1);
            chatContainer.appendChild(pendingDiv);
            pendingDiv.scrollIntoView({ behavior: 'smooth' });

            const response = await window.chatAPI.sendMessage(window.chatAPI.getMessages());

            chatContainer.removeChild(pendingDiv);

            if (response) {
                renderMessages();
            }
            sendBtn.disabled = false;
            // messageInput.focus();
        }
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
            const minHeight = 140; // Minimum height for the footer
            const maxHeight = 500; // Maximum height for the footer
            if (newHeight >= minHeight && newHeight <= maxHeight) {
                footer.style.height = `${newHeight}px`;
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

    clearChatBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the chat?')) {
            window.chatAPI.clearMessages();
            renderMessages();
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
    const currentModel = window.chatAPI.getCurrentModel();
    if (currentModel) {
        modelNickname.textContent = currentModel.nickname;
    } else {
        modelNickname.textContent = 'No Model';
        sendBtn.disabled = true;
    }
    renderMessages();
});
