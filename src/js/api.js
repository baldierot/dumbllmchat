class ChatAPI {
    constructor() {
        this.models = this.getModels();
        this.messages = this.getMessages();
        this.currentModelIndex = this.getCurrentModelIndex();
    }

    getModels() {
        const models = localStorage.getItem('llm_models');
        return models ? JSON.parse(models) : [
            {
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
                "model": "",
                "nickname": "flash-lite",
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
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
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
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
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

    getMessages() {
        const messages = localStorage.getItem('chat_messages');
        return messages ? JSON.parse(messages) : [];
    }

    saveMessages() {
        localStorage.setItem('chat_messages', JSON.stringify(this.messages));
    }

    addMessage(message) {
        this.messages.push(message);
        this.saveMessages();
    }

    updateMessage(index, content) {
        this.messages[index].content = content;
        this.saveMessages();
    }

    removeMessage(index) {
        this.messages.splice(index, 1);
        this.saveMessages();
    }

    clearMessages() {
        this.messages = [];
        this.saveMessages();
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
                const content = data.candidates[0].content;
                if (content && content.parts) {
                    const combinedText = content.parts.map(part => part.text).join('');
                    message = { content: combinedText };
                } else {
                    message = { content: '[The model sent an empty response.]' };
                }
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

window.chatAPI = new ChatAPI();