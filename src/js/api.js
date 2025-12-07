import { normalizeProxyUrl } from './utils.js';

class ChatAPI {
    constructor() {
        this.models = this.getModels();
        this.messages = [];
        this.conversations = [];
        this.currentConversationId = null;
        this.currentModelIndex = this.getCurrentModelIndex();
        this.currentWorkflowId = null; // Added
        this.apiKeys = [];
        this.proxy = '';
        this.invalidKeys = new Map();
        this.init();
    }

    async init() {
        const globalSettings = this.getGlobalSettings();
        this.apiKeys = globalSettings.apiKeys || [];
        this.proxy = globalSettings.proxy || '';

        await this.fetchAndSetModels();
        this.conversations = await window.db.getConversations();
        this.currentConversationId = this.getCurrentConversationId();
        
        // Load workflow or model selection
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
        return models ? JSON.parse(models) : [
            {
                "type": "gemini",
                "modelName": "gemini-2.5-flash-lite",
                "nickname": "flash-lite",
                "temperature": 0.7,
                "maxOutputTokens": 65536,
                "system_prompt": "You are a helpful assistant.",
                "useGoogleSearch": true,
                "useUrlContext": false,
                "prependSystemPrompt": false,
                "thinkingBudget": 24576
            },
            {
                "type": "gemini",
                "modelName": "gemini-2.5-pro",
                "nickname": "pro",
                "temperature": 0.7,
                "maxOutputTokens": 65536,
                "system_prompt": "You are a helpful assistant.",
                "useGoogleSearch": true,
                "useUrlContext": false,
                "prependSystemPrompt": false,
                "thinkingBudget": 24576
            },
            {
                "type": "openai",
                "modelName": "llama-3.3-70b-versatile",
                "nickname": "Groq Llama 3.3",
                "temperature": 0.7,
                "maxOutputTokens": 8192, // Default for OpenAI-compatible models, can be configured by user
                "system_prompt": "You are a helpful assistant.",
                "endpoint": "https://api.groq.com/openai/v1/chat/completions",
                "apiKey": "***REMOVED***",
                "useGoogleSearch": false,
                "useUrlContext": false,
                "prependSystemPrompt": false,
                "reasoningEffort": null
            }
        ];
    }

    async fetchModelInfo(model) {
        if (model.type === "openai") {
            // OpenAI-compatible models don't have a direct model info endpoint like Gemini.
            // maxTokens should be set in the model config itself or default to a reasonable value.
            return { ...model, maxTokens: model.maxOutputTokens || 8192 };
        }

        const { modelName } = model;
        const apiKey = this.getApiKey();
        if (!apiKey) return { ...model, maxTokens: 0 };

        const normalizedProxy = normalizeProxyUrl(this.proxy);
        const fetchEndpoint = `${normalizedProxy}https://generativelanguage.googleapis.com/v1beta/models/${modelName}`;

        try {
            const response = await fetch(fetchEndpoint, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                    'ngrok-skip-browser-warning': 'true'
                }
            });

            if (!response.ok) {
                return { ...model, maxTokens: 0 };
            }

            const data = await response.json();
            return { ...model, maxTokens: data.inputTokenLimit };
        } catch (error) {
            return { ...model, maxTokens: 0 };
        }
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
        return settings ? JSON.parse(settings) : { apiKeys: [], proxy: '' };
    }

    saveGlobalSettings(settings) {
        localStorage.setItem('global_settings', JSON.stringify(settings));
        this.apiKeys = settings.apiKeys || [];
        this.proxy = settings.proxy || '';
    }

    getApiKey() {
        const today = new Date().toISOString().slice(0, 10);
        let validKeys = this.apiKeys.filter(key => {
            const invalidDate = this.invalidKeys.get(key);
            return !invalidDate || invalidDate !== today;
        });

        if (validKeys.length === 0) {
            this.invalidKeys.clear();
            validKeys = this.apiKeys;
        }

        if (validKeys.length === 0) {
            return null;
        }

        return validKeys[0];
    }

    addModel(model) {
        const { apiKey, proxy, ...rest } = model;
        this.models.push(rest);
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
        localStorage.removeItem('current_model_index'); // Unset model
    }

    setCurrentModelIndex(index) {
        this.currentModelIndex = index;
        this.currentWorkflowId = null;
        localStorage.setItem('current_model_index', index);
        localStorage.removeItem('current_workflow_id'); // Unset workflow
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
        // This might need to be updated to fetch from the correct conversation if messages are not already loaded
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

    async countTokens(messages) {
        const currentModel = this.getCurrentModel();
        const { type, modelName } = currentModel;
        
        if (type === 'openai') {
            // OpenAI-compatible APIs typically do not have a dedicated token counting endpoint.
            // For now, return a heuristic or a default value.
            // A more accurate solution would involve a tokenizer library, but that's out of scope for now.
            const textContent = messages.map(msg => msg.content).join(' ');
            return Math.ceil(textContent.length / 4); // ~4 chars per token is a common heuristic
        }

        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('No valid API key available.');
        }

        const normalizedProxy = normalizeProxyUrl(this.proxy);
        const fetchEndpoint = `${normalizedProxy}https://generativelanguage.googleapis.com/v1beta/models/${modelName}:countTokens`;

        const googleMessages = messages.map(msg => {
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
            return {
                role: msg.sender === 'User' ? 'user' : 'model',
                parts: parts
            };
        });

        const requestBody = {
            contents: googleMessages
        };

        try {
            const response = await fetch(fetchEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const today = new Date().toISOString().slice(0, 10);
                this.invalidKeys.set(apiKey, today);
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            return data.totalTokens;
        } catch (error) {
            console.error('Token count failed:', error);
            const today = new Date().toISOString().slice(0, 10);
            this.invalidKeys.set(apiKey, today);
            return 0;
        }
    }

    async _makeApiRequest(modelConfig, messages, tools = [], signal) {
        const { type, modelName, temperature, system_prompt, maxOutputTokens, prependSystemPrompt, thinkingBudget, endpoint } = modelConfig;

        let apiKey = this.getApiKey(); // Use global API key by default
        if (type === 'openai' && modelConfig.apiKey) {
            apiKey = modelConfig.apiKey; // Override with model-specific API key if available
        }
        
        if (!apiKey && type !== 'gemini') { // Gemini can work without API key for some public models
             throw new Error('No valid API key available for this model type.');
        }

        const normalizedProxy = normalizeProxyUrl(this.proxy);
        let fetchEndpoint;
        let requestBody;
        let headers = {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        };

        const mappedMessages = messages.map(msg => {
            const parts = [{ text: msg.content }];
            if (msg.files) {
                // OpenAI-compatible APIs typically don't support inline image data in this format
                // For now, we'll strip file data for OpenAI-compatible calls.
                // A more robust solution might involve sending image URLs if the API supports it.
                if (type === 'gemini') {
                    msg.files.forEach(file => {
                        parts.push({
                            inline_data: {
                                mime_type: file.type,
                                data: file.data.split(',')[1]
                            }
                        });
                    });
                } else {
                    console.warn("Files are not supported for OpenAI-compatible models in this implementation.");
                }
            }
            return {
                role: msg.sender === 'User' ? 'user' : (msg.sender === 'Assistant' ? 'assistant' : 'system'), // OpenAI uses 'assistant' for model responses
                content: msg.content
            };
        });

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
                return {
                    role: msg.sender === 'User' ? 'user' : 'model',
                    parts: parts
                };
            });

            if (prependSystemPrompt) {
                const lastMessage = geminiMessages[geminiMessages.length - 1];
                if (lastMessage.role === 'user') {
                    lastMessage.parts[0].text = `${system_prompt}\n\n${lastMessage.parts[0].text}`;
                }
            }

            requestBody = {
                contents: geminiMessages,
                generationConfig: {
                    temperature,
                    topK: 1,
                    topP: 1,
                    maxOutputTokens: maxOutputTokens || 2048,
                    stopSequences: []
                },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
                ]
            };

            if (!prependSystemPrompt && system_prompt) {
                requestBody.systemInstruction = {
                    role: 'user', // System instructions are weirdly role 'user' for Gemini
                    parts: [{ text: system_prompt }]
                };
            }

            if (tools.length > 0) {
                requestBody.tools = tools;
            }
            
            if (thinkingBudget) {
                requestBody.generationConfig.thinkingConfig = {
                    thinkingBudget: thinkingBudget
                }
            }

        } else if (type === 'openai') {
            fetchEndpoint = normalizedProxy + (endpoint || "https://api.openai.com/v1/chat/completions");
            headers['Authorization'] = `Bearer ${apiKey}`;

            const openAIMessages = [];
            if (system_prompt) {
                openAIMessages.push({ role: 'system', content: system_prompt });
            }
            openAIMessages.push(...mappedMessages);

            requestBody = {
                model: modelName,
                messages: openAIMessages,
                temperature: temperature,
                max_tokens: maxOutputTokens || 2048,
                stop: []
            };

            if (modelConfig.reasoningEffort && modelConfig.reasoningEffort.trim() !== '') {
                requestBody.include_reasoning = true;
                requestBody.reasoning_effort = modelConfig.reasoningEffort;
            } else {
                requestBody.include_reasoning = false;
            }
            // Groq specific: prependSystemPrompt is handled by system role, so no need for special handling here.
            // Tools are not directly supported in the same way for OpenAI-compatible as Gemini.
            // For now, no tool handling for OpenAI-compatible models.
        } else {
            throw new Error(`Unsupported model type: ${type}`);
        }

        try {
            const response = await fetch(fetchEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const today = new Date().toISOString().slice(0, 10);
                this.invalidKeys.set(apiKey, today);
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            if (type === 'gemini') {
                if (!data.candidates || data.candidates.length === 0) {
                    const stopReason = data.promptFeedback?.blockReason;
                    if (stopReason) {
                        return `[The model blocked the response. Reason: ${stopReason}]`;
                    }
                    return '[The model sent an empty response.]';
                }
                const content = data.candidates[0].content;
                if (content && content.parts) {
                    return content.parts.map(part => part.text).join('');
                } else {
                    return '[The model sent an empty response.]';
                }
            } else if (type === 'openai') {
                if (!data.choices || data.choices.length === 0) {
                     return '[The model sent an empty response.]';
                }
                return data.choices[0].message.content;
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                const today = new Date().toISOString().slice(0, 10);
                this.invalidKeys.set(apiKey, today);
            }
            throw error;
        }
    }

    async generateFromModel(modelNickname, messages, flags = [], signal) {
        const modelConfig = this.models.find(m => m.nickname.toLowerCase() === modelNickname.toLowerCase());
        if (!modelConfig) {
            throw new Error(`Model with nickname "${modelNickname}" not found.`);
        }

        const tools = [];
        if (flags.includes('google')) {
            tools.push({ "google_search": {} });
        }
        if (flags.includes('urlcontext')) {
            tools.push({ "url_context": {} });
        }

        return this._makeApiRequest(modelConfig, messages, tools, signal);
    }
    
    async _generateContent(messages, signal) {
        const currentModel = this.getCurrentModel();
        const tools = [];
        if (currentModel.useGoogleSearch) {
            tools.push({ "google_search": {} });
        }
        if (currentModel.useUrlContext) {
            tools.push({ "url_context": {} });
        }
        return this._makeApiRequest(currentModel, messages, tools, signal);
    }

    async sendMessage(messages) {
        const content = await this._generateContent(messages);
        const assistantMessage = { sender: 'Assistant', content };
        return await this.addMessage(assistantMessage);
    }

    async compressConversation(conversationId, progressCallback, signal) {
        if (signal?.aborted) {
            return;
        }

        const conversation = this.conversations.find(c => c.id === conversationId);
        if (!conversation) {
            throw new Error('Conversation not found');
        }

        const messages = await window.db.getMessages(conversationId);
        if (messages.length === 0) {
            throw new Error("Cannot compress an empty conversation.");
        }

        const totalPasses = Math.ceil(messages.length / 8);
        const newConversationName = `[Compressed] ${conversation.name}`;
        const newConversation = await this.addConversation({ name: newConversationName, timestamp: Date.now() });

        const onAbort = async () => {
            await this.deleteConversation(newConversation.id);
            signal.removeEventListener('abort', onAbort);
        };
        signal?.addEventListener('abort', onAbort);


        for (let i = 0; i < messages.length; i += 8) {
            if (signal?.aborted) {
                throw new DOMException('Aborted by user', 'AbortError');
            }

            const currentPass = (i / 8) + 1;
            if (progressCallback) {
                progressCallback(currentPass, totalPasses);
            }

            const chunk = messages.slice(i, i + 8);
            const conversationText = chunk.map(m => `${m.sender}: ${m.content}`).join('\n');

            const compressionPrompt = `You are a Specialized Context Preservation and Compression Engine. Your primary goal is to losslessly (or near-losslessly) compress the provided multi-turn conversation history into a single, highly dense, and concise textual block. This block must function as a perfect summary and contextual anchor for a subsequent LLM to pick up the conversation as if it had access to the full original transcript.\n\nYour output should only contain the compressed message, with no additional commentary or explanations.\n\nPreserve the original writing style of the conversation as much as possible in the compressed output.\n\nIf the conversation is a narrative piece, do not mention the \"Assistant\" or \"User\" roles. Otherwise, you should include them.\n\nHere is the conversation snippet:\n\n${conversationText}`;

            const maxRetries = 3;
            let compressedContent = '';
            for (let j = 0; j < maxRetries; j++) {
                if (signal?.aborted) {
                    throw new DOMException('Aborted by user', 'AbortError');
                }

                compressedContent = await this._generateContent([
                    { sender: 'User', content: compressionPrompt }
                ], signal);

                if (compressedContent.trim() !== '' && compressedContent !== '[The model sent an empty response.]') {
                    break;
                }
                
                if (j < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000)); 
                }
            }

            if (compressedContent.trim() === '' || compressedContent === '[The model sent an empty response.]') {
                throw new Error(`Compression failed for a chunk after ${maxRetries} retries.`);
            }

            const compressedMessage = { sender: 'Assistant', content: compressedContent, conversationId: newConversation.id };
            await window.db.addMessage(compressedMessage);
        }

        signal?.removeEventListener('abort', onAbort);
        return newConversation;
    }
}

window.chatAPI = new ChatAPI();
