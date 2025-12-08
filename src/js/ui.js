import { dom } from './dom.js';
import { WorkflowEngine } from './workflow-engine.js';

let selectedMessage = null;

export function showMessageControls(messageElement, x, y, app) {
    const controls = document.createElement('div');
    controls.className = 'message-controls absolute bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 flex space-x-2';
    const messageId = parseInt(messageElement.dataset.id);

    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', async () => {
        const message = await app.chatAPI.getMessage(messageId);
        dom.messageInput.value = message.content;
        app.attachedFiles = message.files || [];
        app.editingMessageId = messageId;
        renderAttachedFiles(app);
        dom.cancelEditBtn.classList.remove('hidden');
        dom.sendBtn.textContent = '💾';
        removeMessageControls();
        dom.messageInput.focus();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this message?')) {
            await app.chatAPI.removeMessage(messageId);
            app.chatView.removeMessage(messageId);
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
        const messages = await app.chatAPI.getMessages();
        const messageIndex = messages.findIndex(m => m.id === messageId);
        const clickedMessage = messages[messageIndex];

        let newMessages;
        if (clickedMessage.sender === 'User') {
            newMessages = messages.slice(0, messageIndex + 1);
        } else { // Assistant message
            newMessages = messages.slice(0, messageIndex);
        }

        await app.chatAPI.clearMessages();
        for (const msg of newMessages) {
            await app.chatAPI.addMessage(msg);
        }
        
        const scrollTop = dom.chatContainer.scrollTop;
        app.chatView.renderMessages(newMessages);
        dom.chatContainer.scrollTop = scrollTop;

        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.sender === 'User') {
            removeMessageControls();
            dom.sendBtn.disabled = true;

            const tempId = 'temp-' + Date.now();
            app.chatView.appendMessage({ sender: 'Assistant', content: '...', id: tempId }, true);

            try {
                if (app.chatAPI.currentWorkflowId) {
                    // WORKFLOW MODE
                    const workflows = await window.db.getWorkflows();
                    const wf = workflows.find(w => w.id === app.chatAPI.currentWorkflowId);
                    if (!wf) throw new Error('Selected workflow not found.');

                    const engine = new WorkflowEngine(app.chatAPI);
                    const callback = (status) => updateStatusMessage(tempId, status);
                    
                    const result = await engine.execute(wf.script, lastMessage.content, callback);
                    
                    app.chatView.removeMessage(tempId);
                    const assistantMsg = await app.chatAPI.addMessage({ sender: 'Assistant', content: result });
                    app.chatView.appendMessage(assistantMsg);

                } else {
                    // MODEL MODE
                    const response = await app.chatAPI.sendMessage(newMessages);
                    app.chatView.removeMessage(tempId);
                    if (response) {
                        app.chatView.appendMessage(response);
                    }
                }
            } catch (err) {
                app.chatView.removeMessage(tempId);
                const errorMsg = { sender: 'Error', content: err.message, id: Date.now() };
                app.chatView.appendMessage(errorMsg);
            } finally {
                dom.sendBtn.disabled = false;
                if (!app.chatAPI.currentWorkflowId) {
                    updateTokenCountDisplay(app.chatAPI);
                }
            }
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

export function removeMessageControls() {
    const controls = document.querySelector('.message-controls');
    if (controls) {
        controls.remove();
    }
    if (selectedMessage) {
        selectedMessage = null;
    }
};

export async function updateTokenCountDisplay(chatAPI) {
    const messages = await chatAPI.getMessages();
    const currentTokenCount = await chatAPI.countTokens(messages);
    const currentModel = chatAPI.getCurrentModel();
    dom.tokenCountDisplay.textContent = `${currentTokenCount}/${currentModel.maxTokens}`;
};

export async function renderConversations(app) {
    const conversations = await app.chatAPI.getConversations();
    conversations.reverse();
    dom.conversationsContainer.innerHTML = '';
    app.selectedConversationId = null;
    dom.renameConversationBtn.disabled = true;
    dom.deleteConversationBtn.disabled = true;
    dom.loadConversationBtn.disabled = true;
    dom.exportConversationBtn.disabled = true;
    dom.compressConversationBtn.disabled = true;

    for (const conversation of conversations) {
        const conversationLi = document.createElement('li');
        conversationLi.className = 'p-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700';
        conversationLi.dataset.id = conversation.id;

        const conversationName = document.createElement('span');
        conversationName.className = 'truncate';
        let title = conversation.name;
        if (!title) {
            const messages = await window.db.getMessages(conversation.id);
            if (messages.length > 0) {
                title = messages[0].content.split('\n')[0];
            } else {
                title = 'New Conversation';
            }
        }
        conversationName.textContent = title;
        conversationLi.appendChild(conversationName);

        conversationLi.addEventListener('click', () => {
            if (app.selectedConversationId !== null) {
                const previousSelected = dom.conversationsContainer.querySelector(`[data-id='${app.selectedConversationId}']`);
                if (previousSelected) {
                    previousSelected.classList.remove('selected');
                }
            }
            conversationLi.classList.add('selected');
            app.selectedConversationId = conversation.id;
            dom.renameConversationBtn.disabled = false;
            dom.deleteConversationBtn.disabled = false;
            dom.loadConversationBtn.disabled = false;
            dom.exportConversationBtn.disabled = false;
            dom.compressConversationBtn.disabled = false;
            conversationLi.scrollIntoView({ block: 'nearest' });
        });

        dom.conversationsContainer.appendChild(conversationLi);
    }

    const currentConversationLi = dom.conversationsContainer.querySelector(`[data-id='${app.chatAPI.currentConversationId}']`);
    if (currentConversationLi) {
        currentConversationLi.classList.add('selected');
        app.selectedConversationId = app.chatAPI.currentConversationId;
        dom.renameConversationBtn.disabled = false;
        dom.deleteConversationBtn.disabled = false;
        dom.loadConversationBtn.disabled = false;
        dom.exportConversationBtn.disabled = false;
        dom.compressConversationBtn.disabled = false;
        setTimeout(() => {
            currentConversationLi.scrollIntoView({ block: 'nearest' });
        }, 0);
    }
};

export async function renderLlmConfigs(chatAPI) {
    const apiKeyGroups = await window.db.getApiKeyGroups();
    const apiKeyGroupOptions = apiKeyGroups.map(group => `<option value="${group.id}">${group.name}</option>`).join('');

    dom.llmConfigsContainer.innerHTML = '';
    chatAPI.getModels().forEach((model, index) => {
        const configDiv = document.createElement('div');
        configDiv.className = 'mb-4 p-2 border border-black rounded-lg dark:border-black';
        
        const apiKeyGroupSelect = `
            <select class="api-key-group-selector w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" data-index="${index}">
                <option value="" disabled ${!model.apiKeyGroupId ? 'selected' : ''}>Select Key Group...</option>
                ${apiKeyGroupOptions}
            </select>
        `;

        configDiv.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <h3 class="text-lg font-semibold">${model.nickname}</h3>
                <button type="button" class="remove-model-btn text-xl" data-index="${index}">➖</button>
            </div>
            <select class="model-type-selector w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" data-index="${index}">
                <option value="gemini" ${model.type === 'gemini' ? 'selected' : ''}>Gemini</option>
                <option value="openai" ${model.type === 'openai' ? 'selected' : ''}>OpenAI Compatible</option>
            </select>
            <input type="text" value="${model.modelName}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Model Name">
            <input type="text" value="${model.nickname}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Nickname">
            <textarea class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="System Prompt">${model.system_prompt}</textarea>
            
            ${apiKeyGroupSelect}

            <div class="openai-config ${model.type === 'openai' ? '' : 'hidden'}">
                <input type="text" value="${model.endpoint || ''}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600 openai-endpoint" placeholder="API Endpoint (e.g., https://api.groq.com/openai/v1/chat/completions)">
                <input type="text" value="${model.reasoningEffort || ''}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600 openai-reasoning-effort" placeholder="Reasoning Effort (e.g., none, default, low, medium, high)">
            </div>
            <input type="number" step="0.1" value="${model.temperature}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Temperature">
            <input type="number" value="${model.maxOutputTokens || ''}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Max Output Tokens">
            <input type="number" value="${model.thinkingBudget ?? ''}" class="w-full p-2 mt-2 border rounded dark:bg-gray-700 dark:border-gray-600 ${model.type === 'openai' ? 'hidden' : ''}" placeholder="Thinking Budget (tokens)">
            <div class="google-search-container ${model.type === 'openai' ? 'hidden' : ''}">
                <div class="flex items-center mt-2">
                    <input type="checkbox" id="google-search-checkbox-${index}" class="mr-2" ${model.useGoogleSearch ? 'checked' : ''}>
                    <label for="google-search-checkbox-${index}">Enable Google Search</label>
                </div>
                <div class="flex items-center mt-2">
                    <input type="checkbox" id="prepend-system-prompt-checkbox-${index}" class="mr-2" ${model.prependSystemPrompt ? 'checked' : ''}>
                    <label for="prepend-system-prompt-checkbox-${index}">Prepend System Prompt</label>
                </div>
                <div class="flex items-center mt-2">
                    <input type="checkbox" id="url-context-checkbox-${index}" class="mr-2" ${model.useUrlContext ? 'checked' : ''}>
                    <label for="url-context-checkbox-${index}">Enable URL Context</label>
                </div>
            </div>
        `;
        dom.llmConfigsContainer.appendChild(configDiv);
        
        const apiKeyGroupSelector = configDiv.querySelector('.api-key-group-selector');
        if (model.apiKeyGroupId) {
            apiKeyGroupSelector.value = model.apiKeyGroupId;
        }
    });

    document.querySelectorAll('.remove-model-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.target.dataset.index;
            chatAPI.removeModel(index);
            renderLlmConfigs(chatAPI);
        });
    });

    document.querySelectorAll('.model-type-selector').forEach(select => {
        select.addEventListener('change', (e) => {
            const index = e.target.dataset.index;
            const modelConfigDiv = select.closest('.mb-4');
            const openaiConfigDiv = modelConfigDiv.querySelector('.openai-config');
            const thinkingBudgetInput = modelConfigDiv.querySelector('input[placeholder="Thinking Budget (tokens)"]');
            const googleSearchContainer = modelConfigDiv.querySelector('.google-search-container');
            
            if (e.target.value === 'openai') {
                openaiConfigDiv.classList.remove('hidden');
                thinkingBudgetInput.classList.add('hidden');
                googleSearchContainer.classList.add('hidden');
            } else {
                openaiConfigDiv.classList.add('hidden');
                thinkingBudgetInput.classList.remove('hidden');
                googleSearchContainer.classList.remove('hidden');
            }
        });
    });
};

export function renderGlobalSettings(chatAPI) {
    const globalSettings = chatAPI.getGlobalSettings();
    dom.proxyUrl.value = globalSettings.proxy || '';
    dom.sequentialWorkflowRequests.checked = globalSettings.sequentialWorkflowRequests ?? true;
    dom.workflowRequestDelay.value = globalSettings.workflowRequestDelay || 0;
    dom.apiRetryDelay.value = globalSettings.apiRetryDelay ?? 200;
}



export function renderAttachedFiles(app) {
    dom.attachedFilesContainer.innerHTML = '';
    app.attachedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'attached-file-item';
        const fileName = document.createElement('span');
        fileName.textContent = file.name;
        fileItem.appendChild(fileName);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-file-btn';
        removeBtn.textContent = '❌';
        removeBtn.addEventListener('click', () => {
            app.attachedFiles.splice(index, 1);
            renderAttachedFiles(app);
        });
        fileItem.appendChild(removeBtn);
        dom.attachedFilesContainer.appendChild(fileItem);
    });

    const contentContainer = dom.footer.querySelector('.flex-grow');
    const messageInputMinHeight = 90;
    const contentHeight = contentContainer.scrollHeight;
    const minHeight = contentHeight - dom.messageInput.offsetHeight + messageInputMinHeight;
    if (dom.footer.offsetHeight < minHeight) {
        dom.footer.style.height = `${minHeight}px`;
    }
};

export function switchSettingsTab(tabName) {
    // Hide all tabs
    dom.tabGlobal.classList.add('hidden');
    dom.tabModels.classList.add('hidden');
    dom.tabWorkflows.classList.add('hidden');
    document.getElementById('tab-api-keys').classList.add('hidden');

    // Deactivate all tab buttons
    dom.settingsTabs.querySelectorAll('button').forEach(btn => {
        btn.classList.remove('border-blue-500', 'text-blue-500');
        btn.classList.add('text-gray-500');
    });

    // Show the selected tab and activate the button
    const activeTab = dom.settingsTabs.querySelector(`[data-tab="${tabName}"]`);
    const tabContent = document.getElementById(`tab-${tabName}`);
    if (activeTab && tabContent) {
        tabContent.classList.remove('hidden');
        activeTab.classList.add('border-blue-500', 'text-blue-500');
        activeTab.classList.remove('text-gray-500');
    }

    if (tabName === 'api-keys') {
        renderApiKeyGroups();
    }
    if (tabName === 'models') {
        renderLlmConfigs(window.chatAPI);
    }
}

export async function renderApiKeyGroups() {
    const groups = await window.db.getApiKeyGroups();
    const container = document.getElementById('api-key-groups-container');
    container.innerHTML = '';

    groups.forEach(group => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-4 p-2 border rounded-lg dark:border-gray-600';
        groupDiv.dataset.groupId = group.id;

        groupDiv.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <input type="text" value="${group.name}" class="group-name-input text-lg font-semibold bg-transparent border-b dark:border-gray-500 focus:outline-none focus:border-blue-500">
                <button type="button" class="remove-api-key-group-btn text-xl">➖</button>
            </div>
            <div class="api-keys-list space-y-2">
                ${(group.keys || []).map(key => `
                    <div class="flex items-center space-x-2">
                        <input type="text" value="${key}" class="api-key-input w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600" placeholder="API Key">
                        <button type="button" class="remove-api-key-btn text-xl">➖</button>
                    </div>
                `).join('')}
            </div>
            <button type="button" class="add-api-key-to-group-btn mt-2 text-sm p-2 bg-blue-500 text-white rounded-lg">Add Key</button>
        `;
        container.appendChild(groupDiv);
    });
}

export async function renderWorkflowsList(app) {
    const workflows = await window.db.getWorkflows();
    dom.workflowsList.innerHTML = '';
    if (!workflows || workflows.length === 0) {
        dom.workflowsList.innerHTML = '<p class="text-gray-500">No workflows created yet.</p>';
        return;
    }

    workflows.forEach(workflow => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = workflow.name;
        item.appendChild(nameSpan);

        const buttonsDiv = document.createElement('div');
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.className = 'mr-2';
        editBtn.onclick = () => openWorkflowEditor(app, workflow);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.onclick = async () => {
            if (confirm(`Are you sure you want to delete workflow "${workflow.name}"?`)) {
                await window.db.deleteWorkflow(workflow.id);
                renderWorkflowsList(app);
            }
        };

        buttonsDiv.appendChild(editBtn);
        buttonsDiv.appendChild(deleteBtn);
        item.appendChild(buttonsDiv);
        dom.workflowsList.appendChild(item);
    });
}

export function openWorkflowEditor(app, workflow = null) {
    if (workflow) {
        // Edit mode
        app.editingWorkflowId = workflow.id;
        dom.workflowNameInput.value = workflow.name;
        dom.workflowScriptInput.value = workflow.script;
    } else {
        // Add mode
        app.editingWorkflowId = null;
        dom.workflowNameInput.value = '';
        dom.workflowScriptInput.value = '';
    }
    dom.workflowEditorOverlay.classList.remove('hidden');
}

export async function populateModelSelector(chatAPI) {
    const models = chatAPI.getModels();
    const workflows = await window.db.getWorkflows();
    
    dom.modelSelector.innerHTML = '';

    const modelGroup = document.createElement('optgroup');
    modelGroup.label = 'Models';
    models.forEach((model, index) => {
        const option = document.createElement('option');
        option.value = `model_${index}`;
        option.textContent = model.nickname;
        modelGroup.appendChild(option);
    });

    const workflowGroup = document.createElement('optgroup');
    workflowGroup.label = 'Workflows';
    workflows.forEach(workflow => {
        const option = document.createElement('option');
        option.value = `workflow_${workflow.id}`;
        option.textContent = workflow.name;
        workflowGroup.appendChild(option);
    });

    dom.modelSelector.appendChild(modelGroup);
    dom.modelSelector.appendChild(workflowGroup);

    // Set selected
    if (chatAPI.currentWorkflowId) {
        dom.modelSelector.value = `workflow_${chatAPI.currentWorkflowId}`;
    } else {
        dom.modelSelector.value = `model_${chatAPI.currentModelIndex}`;
    }
}

export function updateStatusMessage(tempId, text) {
    const messageElement = dom.chatContainer.querySelector(`[data-id="${tempId}"]`);
    if (messageElement) {
        const contentElement = messageElement.querySelector('.message-content');
        if (contentElement) {
            contentElement.textContent = text;
        }
    }
}
