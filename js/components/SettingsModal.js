
class SettingsModal {
    constructor() {
        this.settingsModal = document.getElementById('settings-modal');
        this.llmConfigsContainer = document.getElementById('llm-configs-container');
        this.addModelBtn = document.getElementById('add-model-btn');
        this.saveSettingsBtn = document.getElementById('save-settings-btn');
        this.closeSettingsBtn = document.getElementById('close-settings-btn');
        this.importSettingsBtn = document.getElementById('import-settings-btn');
        this.exportSettingsBtn = document.getElementById('export-settings-btn');

        window.eventManager.subscribe('openSettings', () => this.open());
        this.closeSettingsBtn.addEventListener('click', () => this.close());
        this.addModelBtn.addEventListener('click', () => this.addModel());
        this.saveSettingsBtn.addEventListener('click', (e) => this.saveSettings(e));
        this.importSettingsBtn.addEventListener('click', () => this.importSettings());
        this.exportSettingsBtn.addEventListener('click', () => this.exportSettings());
    }

    open() {
        this.renderLlmConfigs();
        this.settingsModal.classList.remove('hidden');
    }

    close() {
        this.settingsModal.classList.add('hidden');
    }

    addModel() {
        window.chatStore.addModel({
            endpoint: '',
            apiKey: '',
            model: '',
            nickname: 'New Model',
            temperature: 0.7,
            system_prompt: 'You are a helpful assistant.',
            apiSchema: 'openai',
            maxOutputTokens: 2048
        });
        this.renderLlmConfigs();
    }

    saveSettings(e) {
        e.preventDefault();
        const newModels = Array.from(this.llmConfigsContainer.children).map(configDiv => {
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
        window.chatStore.models = newModels;
        window.chatStore._saveModels();
        this.close();
    }

    importSettings() {
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
                    window.chatStore.models = newModels;
                    window.chatStore._saveModels();
                    this.renderLlmConfigs();
                    alert('Settings imported successfully!');
                } catch (error) {
                    alert('Error importing settings: ' + error.message);
                }
            }
            reader.readAsText(file);
        }
        input.click();
    }

    exportSettings() {
        const models = window.chatStore.getModels();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(models, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href",     dataStr);
        downloadAnchorNode.setAttribute("download", "gemini-chat-settings.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    renderLlmConfigs() {
        this.llmConfigsContainer.innerHTML = '';
        window.chatStore.getModels().forEach((model, index) => {
            const configDiv = document.createElement('div');
            configDiv.className = 'mb-4 p-4 border rounded-lg dark:border-gray-600';
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
                <input type="password" value="${model.apiKey || ''}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="API Key">
                <input type="number" step="0.1" value="${model.temperature}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Temperature">
                <input type="number" value="${model.maxOutputTokens || ''}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Max Output Tokens">
                <textarea class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="System Prompt">${model.system_prompt}</textarea>
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
                    <input type="number" value="${model.thinkingBudget ?? ''}" class="w-full p-2 mt-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Thinking Budget (tokens)">
                </div>
            `;
            this.llmConfigsContainer.appendChild(configDiv);
        });

        document.querySelectorAll('.remove-model-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = e.target.dataset.index;
                window.chatStore.removeModel(index);
                this.renderLlmConfigs();
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
    }
}
