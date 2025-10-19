import { normalizeProxyUrl } from './utils.js';

class ChatAPI {
    constructor() {
        this.models = this.getModels();
        this.messages = [];
        this.conversations = [];
        this.currentConversationId = null;
        this.currentModelIndex = this.getCurrentModelIndex();
        this.init();
    }

    async init() {
        await this.fetchAndSetModels();
        this.conversations = await window.db.getConversations();
        this.currentConversationId = this.getCurrentConversationId();
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
                                                "modelName": "gemini-2.5-flash-lite",
                "nickname": "flash-lite",
                "apiKey": "",
                "temperature": 0.7,
                "maxOutputTokens": 65536,
                "proxy": "",
                "system_prompt": "You are a helpful assistant.",
                "useGoogleSearch": true,
                "useUrlContext": false,
                "prependSystemPrompt": false,
                "thinkingBudget": 24576
            },
                        {
                                                "modelName": "gemini-2.5-pro",
                "nickname": "pro",
                "apiKey": "",
                "temperature": 0.7,
                "maxOutputTokens": 65536,
                "proxy": "",
                "system_prompt": "You are a helpful assistant.",
                "useGoogleSearch": true,
                "useUrlContext": false,
                "prependSystemPrompt": false,
                "thinkingBudget": 24576
            },
            
        ];
    }

    async fetchModelInfo(model) {
        const { modelName, apiKey, proxy } = model;
        const normalizedProxy = normalizeProxyUrl(proxy);
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

    cycleModel() {
        this.currentModelIndex = (this.currentModelIndex + 1) % this.models.length;
        this.saveCurrentModelIndex();
        return this.getCurrentModel();
    }

    getCurrentModelIndex() {
        const index = localStorage.getItem('current_model_index');
        return index ? parseInt(index, 10) : 0;
    }

    saveCurrentModelIndex() {
        localStorage.setItem('current_model_index', this.currentModelIndex);
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
                        const { modelName, apiKey, proxy } = currentModel;
        const normalizedProxy = normalizeProxyUrl(proxy);
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
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            return data.totalTokens;
        } catch (error) {
            console.error('Token count failed:', error);
            return 0;
        }
    }

    async _generateContent(messages, signal) {
        const currentModel = this.getCurrentModel();
        const { modelName, apiKey, temperature, system_prompt, useGoogleSearch, useUrlContext, maxOutputTokens, prependSystemPrompt, thinkingBudget, proxy } = currentModel;

        let requestBody;
        const normalizedProxy = normalizeProxyUrl(proxy);
        const fetchEndpoint = `${normalizedProxy}https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

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

        if (prependSystemPrompt) {
            const lastMessage = googleMessages[googleMessages.length - 1];
            if (lastMessage.role === 'user') {
                lastMessage.parts[0].text = `${system_prompt}\n\n${lastMessage.parts[0].text}`;
            }
        }

        requestBody = {
            contents: googleMessages,
            generationConfig: {
                temperature,
                topK: 1,
                topP: 1,
                maxOutputTokens: maxOutputTokens || 2048,
                stopSequences: []
            },
            safetySettings: [
                {
                    category: 'HARM_CATEGORY_HARASSMENT',
                    threshold: 'BLOCK_NONE'
                },
                {
                    category: 'HARM_CATEGORY_HATE_SPEECH',
                    threshold: 'BLOCK_NONE'
                },
                {
                    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                    threshold: 'BLOCK_NONE'
                },
                {
                    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                    threshold: 'BLOCK_NONE'
                }
            ]
        };

        if (!prependSystemPrompt) {
            requestBody.systemInstruction = {
                role: 'user',
                parts: [{ text: system_prompt }]
            };
        }

        const tools = [];
        if (useGoogleSearch) {
            tools.push({ "google_search": {} });
        }
        if (useUrlContext) {
            tools.push({ "url_context": {} });
        }
        if (tools.length > 0) {
            requestBody.tools = tools;
        }

        if (thinkingBudget) {
            requestBody.generationConfig.thinkingConfig = {
                thinkingBudget: thinkingBudget
            }
        }

        const response = await fetch(fetchEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(requestBody),
            signal
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) {
            return '[The model sent an empty response.]';
        }
        const content = data.candidates[0].content;
        if (content && content.parts) {
            return content.parts.map(part => part.text).join('');
        } else {
            return '[The model sent an empty response.]';
        }
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

        const totalPasses = Math.ceil(messages.length / 4);
        const newConversationName = `[Compressed] ${conversation.name}`;
        const newConversation = await this.addConversation({ name: newConversationName, timestamp: Date.now() });

        const onAbort = async () => {
            await this.deleteConversation(newConversation.id);
            signal.removeEventListener('abort', onAbort);
        };
        signal?.addEventListener('abort', onAbort);


        for (let i = 0; i < messages.length; i += 4) {
            if (signal?.aborted) {
                throw new DOMException('Aborted by user', 'AbortError');
            }

            const currentPass = (i / 4) + 1;
            if (progressCallback) {
                progressCallback(currentPass, totalPasses);
            }

            const chunk = messages.slice(i, i + 4);
            const conversationText = chunk.map(m => `${m.sender}: ${m.content}`).join('\n');

            const compressionPrompt = `You are a Specialized Context Preservation and Compression Engine. Your primary goal is to losslessly (or near-losslessly) compress the provided multi-turn conversation history into a single, highly dense, and concise textual block. This block must function as a perfect summary and contextual anchor for a subsequent LLM to pick up the conversation as if it had access to the full original transcript.\n\nYour output should only contain the compressed message, with no additional commentary or explanations.\n\nPreserve the original writing style of the conversation to some extent in the compressed output.\n\nHere is the conversation snippet:\n\n${conversationText}`;

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
