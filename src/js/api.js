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
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
                "nickname": "flash-lite",
                "apiKey": "",
                "temperature": 0.7,
                "maxOutputTokens": null,
                "system_prompt": "You are a helpful assistant.",
                "useGoogleSearch": true,
                "useUrlContext": false,
                "prependSystemPrompt": false,
                "thinkingBudget": 24576
            },
            {
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
                "nickname": "flash",
                "apiKey": "",
                "temperature": 0.7,
                "maxOutputTokens": null,
                "system_prompt": "You are a helpful assistant.",
                "useGoogleSearch": true,
                "useUrlContext": false,
                "prependSystemPrompt": false,
                "thinkingBudget": 24576
            },
            {
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
                "nickname": "pro",
                "apiKey": "",
                "temperature": 0.7,
                "maxOutputTokens": null,
                "system_prompt": "You are a helpful assistant.",
                "useGoogleSearch": true,
                "useUrlContext": false,
                "prependSystemPrompt": false,
                "thinkingBudget": 32768
            }
        ];
    }

    saveModels(models) {
        this.models = models;
        localStorage.setItem('llm_models', JSON.stringify(models));
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

    async sendMessage(messages) {
        const currentModel = this.getCurrentModel();
        const { endpoint, apiKey, temperature, system_prompt, useGoogleSearch, useUrlContext, maxOutputTokens, prependSystemPrompt, thinkingBudget } = currentModel;

        let requestBody;
        let fetchEndpoint = endpoint;

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

        fetchEndpoint = endpoint;

        try {
            const response = await fetch(fetchEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            let message;

            const content = data.candidates[0].content;
            if (content && content.parts) {
                const combinedText = content.parts.map(part => part.text).join('');
                message = { content: combinedText };
            } else {
                message = { content: '[The model sent an empty response.]' };
            }

            if (message?.content) {
                const assistantMessage = { sender: 'Assistant', content: message.content };
                return await this.addMessage(assistantMessage);
            } else {
                throw new Error('API Error: Invalid response format.');
            }

        } catch (error) {
            console.error('API call failed:', error);
            const errorMessage = { sender: 'Error', content: `An error occurred: ${error.message}` };
            return await this.addMessage(errorMessage);
        }
    }
}

window.chatAPI = new ChatAPI();
