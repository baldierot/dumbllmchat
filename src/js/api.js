import { normalizeProxyUrl } from './utils.js';

class ChatAPI {
    constructor() {
        this.models = this.getModels();
        this.messages = [];
        this.conversations = [];
        this.currentConversationId = null;
        this.currentModelIndex = this.getCurrentModelIndex();
        this.currentWorkflowId = null;
        this.proxy = '';
        this.workflowRequestDelay = 0;
        this.sequentialWorkflowRequests = true;
        this.apiRetryDelay = 200;
        this.init();
    }

    async init() {
        const globalSettings = this.getGlobalSettings();
        this.proxy = globalSettings.proxy || '';
        this.workflowRequestDelay = globalSettings.workflowRequestDelay || 0;
        this.sequentialWorkflowRequests = globalSettings.sequentialWorkflowRequests ?? true;
        this.apiRetryDelay = globalSettings.apiRetryDelay ?? 200;

        await this.fetchAndSetModels();
        this.conversations = await window.db.getConversations();
        this.currentConversationId = this.getCurrentConversationId();
        
        this.currentWorkflowId = localStorage.getItem('current_workflow_id');
        this.currentModelIndex = this.getCurrentModelIndex();

        if (!this.currentConversationId && this.conversations.length > 0) {
            this.currentConversationId = this.conversations[0].id;
            this.saveCurrentConversationId();
        }
        if (this.currentConversationId) {
            this.messages = await this.getMessages();
        }
    }

    getCurrentConversationId() {
        return parseInt(localStorage.getItem('current_conversation_id'));
    }

    saveCurrentConversationId() {
        localStorage.setItem('current_conversation_id', this.currentConversationId);
    }

    async getConversations() {
        this.conversations = await window.db.getConversations();
        return this.conversations;
    }

    async addConversation(conversation) {
        const id = await window.db.addConversation(conversation);
        const newConversation = { ...conversation, id };
        this.conversations.push(newConversation);
        return newConversation;
    }

    async updateConversation(conversation) {
        await window.db.updateConversation(conversation);
        const index = this.conversations.findIndex(c => c.id === conversation.id);
        if (index !== -1) {
            this.conversations[index] = conversation;
        }
    }

    async deleteConversation(id) {
        await window.db.deleteConversation(id);
        this.conversations = this.conversations.filter(c => c.id !== id);
        if (this.currentConversationId === id) {
            if (this.conversations.length > 0) {
                this.currentConversationId = this.conversations[0].id;
            } else {
                this.currentConversationId = null;
            }
            this.saveCurrentConversationId();
        }
    }

    async switchConversation(id) {
        this.currentConversationId = id;
        this.saveCurrentConversationId();
        this.messages = await this.getMessages();
    }

    getModels() {
        const models = localStorage.getItem('llm_models');
        return models ? JSON.parse(models) : [];
    }

    async fetchModelInfo(model) {
        return { ...model, maxTokens: model.maxOutputTokens || 8192 };
    }

    async fetchAndSetModels() {
        const models = this.getModels();
        const modelsWithInfo = await Promise.all(models.map(m => this.fetchModelInfo(m)));
        this.models = modelsWithInfo;
    }

    async saveModels(models) {
        const modelsToSave = models.map(m => {
            const { maxTokens, ...rest } = m;
            return rest;
        });
        localStorage.setItem('llm_models', JSON.stringify(modelsToSave));
        await this.fetchAndSetModels();
    }

    getGlobalSettings() {
        const settings = localStorage.getItem('global_settings');
        return settings ? JSON.parse(settings) : { proxy: '', workflowRequestDelay: 0, sequentialWorkflowRequests: true, apiRetryDelay: 200 };
    }

    saveGlobalSettings(settings) {
        localStorage.setItem('global_settings', JSON.stringify(settings));
        this.proxy = settings.proxy || '';
        this.workflowRequestDelay = settings.workflowRequestDelay || 0;
        this.sequentialWorkflowRequests = settings.sequentialWorkflowRequests ?? true;
        this.apiRetryDelay = settings.apiRetryDelay ?? 200;
    }

    addModel(model) {
        this.models.push(model);
        this.saveModels(this.models);
    }

    updateModel(index, model) {
        this.models[index] = model;
        this.saveModels(this.models);
    }

    removeModel(index) {
        this.models.splice(index, 1);
        this.saveModels(this.models);
    }

    getCurrentModel() {
        return this.models[this.currentModelIndex];
    }

    setCurrentWorkflow(id) {
        this.currentWorkflowId = id;
        localStorage.setItem('current_workflow_id', id);
        localStorage.removeItem('current_model_index');
    }

    setCurrentModelIndex(index) {
        this.currentModelIndex = index;
        this.currentWorkflowId = null;
        localStorage.setItem('current_model_index', index);
        localStorage.removeItem('current_workflow_id');
    }

    getCurrentModelIndex() {
        const index = localStorage.getItem('current_model_index');
        return index ? parseInt(index, 10) : 0;
    }

    async getMessages() {
        if (!this.currentConversationId) return [];
        this.messages = await window.db.getMessages(this.currentConversationId);
        return this.messages;
    }

    async getMessage(id) {
        return this.messages.find(m => m.id === id);
    }

    async addMessage(message) {
        if (!this.currentConversationId) {
            const newConversation = await this.addConversation({ name: 'New Conversation', timestamp: Date.now() });
            this.currentConversationId = newConversation.id;
            this.saveCurrentConversationId();
        }
        const messageWithConversation = { ...message, conversationId: this.currentConversationId };
        const id = await window.db.addMessage(messageWithConversation);
        const newMessage = { ...messageWithConversation, id };
        this.messages.push(newMessage);
        return newMessage;
    }

    async updateMessage(id, content, files) {
        const message = await this.getMessage(id);
        message.content = content;
        if (files) {
            message.files = files;
        }
        await window.db.updateMessage(message);
        return message;
    }

    async removeMessage(id) {
        await window.db.removeMessage(id);
        this.messages = this.messages.filter(m => m.id !== id);
    }

    async clearMessages() {
        if (!this.currentConversationId) return;
        await window.db.clearMessages(this.currentConversationId);
        this.messages = [];
    }

    async executeRequestWithCycling(modelConfig, buildRequestPayload, signal) {
        if (!modelConfig.apiKeyGroupId) {
            throw new Error(`Model "${modelConfig.nickname}" has no API key group assigned.`);
        }

        const apiKeyGroup = await window.db.getApiKeyGroup(modelConfig.apiKeyGroupId);
        
        const keys = (apiKeyGroup?.keys || []).filter(k => k);

        if (keys.length === 0) {
            throw new Error(`API key group "${apiKeyGroup?.name || 'Unknown'}" is empty or does not exist.`);
        }

        let lastError = null;
        let lastErrorTime = null;
        let keyIndex = 0;

        while (true) {
            const apiKey = keys[keyIndex];
            keyIndex = (keyIndex + 1) % keys.length;

            if (signal?.aborted) {
                throw new DOMException('Aborted by user', 'AbortError');
            }

            if (lastErrorTime && (Date.now() - lastErrorTime > 60000)) {
                throw new Error(`API requests failed for 60 seconds. Last error: ${lastError.message}`);
            }

            try {
                const { endpoint, headers, body } = buildRequestPayload(modelConfig, apiKey);
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body),
                    signal
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    if (response.status === 403 || response.status === 404) {
                        throw new Error(`Unrecoverable API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
                    }
                    throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
                }
                
                return await response.json();

            } catch (error) {
                if (error.message.startsWith('Unrecoverable')) {
                    throw error;
                }
                lastError = error;
                lastErrorTime = Date.now();
                console.warn(`API request with key ending in ...${apiKey.slice(-4)} failed:`, error.message);
                
                await new Promise(resolve => setTimeout(resolve, this.apiRetryDelay));
            }
        }
    }

    _buildApiRequest(modelConfig, apiKey, messages, tools = []) {
        const { type, modelName, temperature, system_prompt, maxOutputTokens, prependSystemPrompt, thinkingBudget, endpoint } = modelConfig;
        const normalizedProxy = normalizeProxyUrl(this.proxy);
        let fetchEndpoint;
        let requestBody;
        let headers = {
            'Content-Type': 'application/json'
        };
        if (this.proxy) {
            headers['ngrok-skip-browser-warning'] = 'true';
        }

        if (type === 'gemini') {
            fetchEndpoint = `${normalizedProxy}https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
            headers['x-goog-api-key'] = apiKey;

            let geminiMessages = messages.map(msg => {
                const parts = [{ text: msg.content }];
                if (msg.files) {
                    msg.files.forEach(file => {
                        parts.push({
                            inline_data: {
                                mime_type: file.type,
                                data: file.data.split(',')[1]
                            }
                        });
                    });
                }
                return { role: msg.sender === 'User' ? 'user' : 'model', parts };
            });

            if (prependSystemPrompt && system_prompt) {
                const lastMessage = geminiMessages[geminiMessages.length - 1];
                if (lastMessage.role === 'user') {
                    lastMessage.parts[0].text = `${system_prompt}\n\n${lastMessage.parts[0].text}`;
                }
            }

            requestBody = {
                contents: geminiMessages,
                generationConfig: { temperature, topK: 1, topP: 1, maxOutputTokens: maxOutputTokens || 8192, stopSequences: [] },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                ]
            };
            if (!prependSystemPrompt && system_prompt) {
                requestBody.systemInstruction = { role: 'user', parts: [{ text: system_prompt }] };
            }
            if (tools.length > 0) requestBody.tools = tools;
            if (thinkingBudget) requestBody.generationConfig.thinkingConfig = { thinkingBudget };

        } else if (type === 'openai') {
            fetchEndpoint = normalizedProxy + (endpoint || "https://api.openai.com/v1/chat/completions");
            headers['Authorization'] = `Bearer ${apiKey}`;

            const openAIMessages = messages.map(msg => ({
                role: msg.sender === 'User' ? 'user' : 'assistant',
                content: msg.content
            }));
            
            if (system_prompt) {
                openAIMessages.unshift({ role: 'system', content: system_prompt });
            }

            requestBody = { model: modelName, messages: openAIMessages, temperature: temperature, max_tokens: maxOutputTokens || 2048 };
            if (modelConfig.reasoningEffort) {
                requestBody.include_reasoning = true;
                requestBody.reasoning_effort = modelConfig.reasoningEffort;
            }
        } else {
            throw new Error(`Unsupported model type: ${type}`);
        }
        
        return { endpoint: fetchEndpoint, headers, body: requestBody };
    }

    async _generateContent(messages, signal) {
        const currentModel = this.getCurrentModel();
        const tools = [];
        if (currentModel.useGoogleSearch) tools.push({ "google_search": {} });
        if (currentModel.useUrlContext) tools.push({ "url_context": {} });

        const buildRequestPayload = (modelConfig, apiKey) => this._buildApiRequest(modelConfig, apiKey, messages, tools);
        
        const data = await this.executeRequestWithCycling(currentModel, buildRequestPayload, signal);

        if (currentModel.type === 'gemini') {
            if (!data.candidates || data.candidates.length === 0) {
                const stopReason = data.promptFeedback?.blockReason;
                return stopReason ? `[The model blocked the response. Reason: ${stopReason}]` : '[The model sent an empty response.]';
            }
            const content = data.candidates[0].content;
            return content?.parts ? content.parts.map(part => part.text).join('') : '[The model sent an empty response.]';
        } else if (currentModel.type === 'openai') {
            return data.choices?.[0]?.message?.content || '[The model sent an empty response.]';
        }
        return '[An unknown error occurred]';
    }

    async sendMessage(messages) {
        const content = await this._generateContent(messages);
        const assistantMessage = { sender: 'Assistant', content };
        return await this.addMessage(assistantMessage);
    }
    
    async generateFromModel(modelNickname, messages, flags = [], signal) {
        const modelConfig = this.models.find(m => m.nickname.toLowerCase() === modelNickname.toLowerCase());
        if (!modelConfig) {
            throw new Error(`Model with nickname "${modelNickname}" not found.`);
        }

        const tools = [];
        if (flags.includes('google')) tools.push({ "google_search": {} });
        if (flags.includes('urlcontext')) tools.push({ "url_context": {} });

        const buildRequestPayload = (config, apiKey) => this._buildApiRequest(config, apiKey, messages, tools);

        const data = await this.executeRequestWithCycling(modelConfig, buildRequestPayload, signal);

        if (modelConfig.type === 'gemini') {
            if (!data.candidates || data.candidates.length === 0) {
                const stopReason = data.promptFeedback?.blockReason;
                return stopReason ? `[The model blocked the response. Reason: ${stopReason}]` : '[The model sent an empty response.]';
            }
            const content = data.candidates[0].content;
            return content?.parts ? content.parts.map(part => part.text).join('') : '[The model sent an empty response.]';
        } else if (modelConfig.type === 'openai') {
            return data.choices?.[0]?.message?.content || '[The model sent an empty response.]';
        }
        return '[An unknown error occurred]';
    }

    async countTokens(messages) {
        const currentModel = this.getCurrentModel();
        if (currentModel.type === 'openai') {
            const textContent = messages.map(msg => msg.content).join(' ');
            return Math.ceil(textContent.length / 4);
        }

        const buildRequestPayload = (modelConfig, apiKey) => {
            const { modelName } = modelConfig;
            const normalizedProxy = normalizeProxyUrl(this.proxy);
            const endpoint = `${normalizedProxy}https://generativelanguage.googleapis.com/v1beta/models/${modelName}:countTokens`;
            const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
            if (this.proxy) {
                headers['ngrok-skip-browser-warning'] = 'true';
            }
            const body = { contents: messages.map(msg => ({ role: msg.sender === 'User' ? 'user' : 'model', parts: [{ text: msg.content }] })) };
            return { endpoint, headers, body };
        };

        try {
            const data = await this.executeRequestWithCycling(currentModel, buildRequestPayload);
            return data.totalTokens;
        } catch (error) {
            console.error('Token count failed:', error);
            return 0; // Return 0 if token counting fails
        }
    }

    async compressConversation(conversationId, progressCallback, signal) {
        if (signal?.aborted) return;

        const conversation = this.conversations.find(c => c.id === conversationId);
        if (!conversation) throw new Error('Conversation not found');

        const messages = await window.db.getMessages(conversationId);
        if (messages.length === 0) throw new Error("Cannot compress an empty conversation.");

        const totalPasses = Math.ceil(messages.length / 8);
        const newConversationName = `[Compressed] ${conversation.name}`;
        const newConversation = await this.addConversation({ name: newConversationName, timestamp: Date.now() });

        const onAbort = async () => {
            await this.deleteConversation(newConversation.id);
            signal.removeEventListener('abort', onAbort);
        };
        signal?.addEventListener('abort', onAbort);

        for (let i = 0; i < messages.length; i += 8) {
            if (signal?.aborted) throw new DOMException('Aborted by user', 'AbortError');
            if (progressCallback) progressCallback((i / 8) + 1, totalPasses);

            const chunk = messages.slice(i, i + 8);
            const conversationText = chunk.map(m => `${m.sender}: ${m.content}`).join('\n');
            const compressionPrompt = `... [your compression prompt] ...\n\n${conversationText}`;

            const compressedContent = await this._generateContent([{ sender: 'User', content: compressionPrompt }], signal);

            if (!compressedContent || compressedContent.trim() === '' || compressedContent.includes('empty response')) {
                 throw new Error(`Compression failed for a chunk.`);
            }

            await window.db.addMessage({ sender: 'Assistant', content: compressedContent, conversationId: newConversation.id });
        }

        signal?.removeEventListener('abort', onAbort);
        return newConversation;
    }
}

window.chatAPI = new ChatAPI();
