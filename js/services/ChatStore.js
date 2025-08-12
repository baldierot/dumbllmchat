class ChatStore {
    constructor() {
        this.models = this._getModels();
        this.messages = this._getMessages();
        this.currentModelIndex = this._getCurrentModelIndex();
    }

    _getModels() {
        const models = localStorage.getItem('llm_models');
        return models ? JSON.parse(models) : [
            {
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
                "model": "",
                "nickname": "flash",
                "apiKey": "",
                "temperature": 0.7,
                "maxOutputTokens": null,
                "system_prompt": "You are a helpful assistant.",
                "apiSchema": "google",
                "useGoogleSearch": true,
                "prependSystemPrompt": false,
                "thinkingBudget": 24576
            },
            {
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent",
                "model": "",
                "nickname": "pro",
                "apiKey": "",
                "temperature": 0.7,
                "maxOutputTokens": null,
                "system_prompt": "You are a helpful assistant.",
                "apiSchema": "google",
                "useGoogleSearch": true,
                "prependSystemPrompt": false,
                "thinkingBudget": 32768
            }
        ];
    }

    _saveModels() {
        localStorage.setItem('llm_models', JSON.stringify(this.models));
        window.eventManager.publish('modelsChanged', this.models);
    }

    _getMessages() {
        const messages = localStorage.getItem('chat_messages');
        return messages ? JSON.parse(messages) : [];
    }

    _saveMessages() {
        localStorage.setItem('chat_messages', JSON.stringify(this.messages));
        window.eventManager.publish('messagesChanged', this.messages);
    }

    _getCurrentModelIndex() {
        const index = localStorage.getItem('current_model_index');
        return index ? parseInt(index, 10) : 0;
    }

    _saveCurrentModelIndex() {
        localStorage.setItem('current_model_index', this.currentModelIndex);
        window.eventManager.publish('modelChanged', this.getCurrentModel());
    }

    getModels() {
        return this.models;
    }

    addModel(model) {
        this.models.push(model);
        this._saveModels();
    }

    updateModel(index, model) {
        this.models[index] = model;
        this._saveModels();
    }

    removeModel(index) {
        this.models.splice(index, 1);
        this._saveModels();
    }

    getCurrentModel() {
        return this.models[this.currentModelIndex];
    }

    cycleModel() {
        this.currentModelIndex = (this.currentModelIndex + 1) % this.models.length;
        this._saveCurrentModelIndex();
    }

    getMessages() {
        return this.messages;
    }

    addMessage(message) {
        this.messages.push(message);
        this._saveMessages();
    }

    updateMessage(index, content) {
        this.messages[index].content = content;
        this._saveMessages();
    }

    removeMessage(index) {
        this.messages.splice(index, 1);
        this._saveMessages();
    }

    clearMessages() {
        this.messages = [];
        this._saveMessages();
    }

    async sendMessage(messages) {
        const currentModel = this.getCurrentModel();
        const { endpoint, apiKey, model, temperature, system_prompt, apiSchema, useGoogleSearch, maxOutputTokens, prependSystemPrompt, thinkingBudget } = currentModel;

        let requestBody;
        let fetchEndpoint = endpoint;

        if (apiSchema === 'google') {
            const googleMessages = messages.map(msg => ({
                role: msg.sender === 'User' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }));

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

            if (useGoogleSearch) {
                requestBody.tools = [
                    {
                        "google_search": {}
                    }
                ];
            }

            if (thinkingBudget) {
                requestBody.generationConfig.thinkingConfig = {
                    thinkingBudget: thinkingBudget
                }
            }

            fetchEndpoint = endpoint;
        } else { // openai
            let apiMessages;
            if (prependSystemPrompt) {
                apiMessages = messages.map(msg => ({
                    role: msg.sender.toLowerCase(),
                    content: msg.content
                }));
                const lastMessage = apiMessages[apiMessages.length - 1];
                if (lastMessage.role === 'user') {
                    lastMessage.content = `${system_prompt}\n\n${lastMessage.content}`;
                }
            } else {
                apiMessages = [
                    { role: 'system', content: system_prompt },
                    ...messages.map(msg => ({
                        role: msg.sender.toLowerCase(),
                        content: msg.content
                    }))
                ];
            }


            requestBody = {
                model,
                messages: apiMessages,
                temperature,
            };
        }

        try {
            const response = await fetch(fetchEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiSchema === 'openai' && { 'Authorization': `Bearer ${apiKey}` }),
                    ...(apiSchema === 'google' && { 'x-goog-api-key': apiKey })
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            let message;

            if (apiSchema === 'google') {
                const contentParts = data.candidates[0].content.parts;
                const combinedText = contentParts.map(part => part.text).join('');
                message = { content: combinedText };
            } else { // openai
                message = data.choices[0]?.message;
            }

            if (message?.content) {
                const assistantMessage = { sender: 'Assistant', content: message.content };
                this.addMessage(assistantMessage);
                return assistantMessage;
            } else if (message?.tool_calls) {
                const toolCall = message.tool_calls[0];
                const functionName = toolCall.function.name;
                const functionArgs = toolCall.function.arguments;
                const content = `The model wants to call the '${functionName}' tool with the following arguments: ${functionArgs}. However, tool execution is not yet implemented.`;
                const toolMessage = { sender: 'Assistant', content: content };
                this.addMessage(toolMessage);
                return toolMessage;
            } else {
                throw new Error('API Error: Invalid response format.');
            }

        } catch (error) {
            console.error('API call failed:', error);
            const errorMessage = { sender: 'Error', content: `An error occurred: ${error.message}` };
            this.addMessage(errorMessage);
            return errorMessage;
        }
    }
}

window.chatStore = new ChatStore();
