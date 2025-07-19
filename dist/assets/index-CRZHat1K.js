(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) return;
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) processPreload(link);
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) if (node.tagName === "LINK" && node.rel === "modulepreload") processPreload(node);
    }
  }).observe(document, {
    childList: true,
    subtree: true
  });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials") fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep) return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
class ChatAPI {
  constructor() {
    this.models = this.getModels();
    this.messages = this.getMessages();
    this.currentModelIndex = this.getCurrentModelIndex();
  }
  getModels() {
    const models = localStorage.getItem("llm_models");
    return models ? JSON.parse(models) : [
      {
        endpoint: "https://api.openai.com/v1/chat/completions",
        apiKey: "",
        model: "gpt-3.5-turbo",
        nickname: "GPT-3.5",
        temperature: 0.7,
        system_prompt: "You are a helpful assistant.",
        apiSchema: "openai"
      },
      {
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent",
        apiKey: "",
        model: "gemini-1.5-flash-latest",
        nickname: "Gemini 1.5 Flash",
        temperature: 0.7,
        system_prompt: "You are a helpful assistant.",
        apiSchema: "google"
      }
    ];
  }
  saveModels(models) {
    this.models = models;
    localStorage.setItem("llm_models", JSON.stringify(models));
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
    const index = localStorage.getItem("current_model_index");
    return index ? parseInt(index, 10) : 0;
  }
  saveCurrentModelIndex() {
    localStorage.setItem("current_model_index", this.currentModelIndex);
  }
  getMessages() {
    const messages = localStorage.getItem("chat_messages");
    return messages ? JSON.parse(messages) : [];
  }
  saveMessages() {
    localStorage.setItem("chat_messages", JSON.stringify(this.messages));
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
    const { endpoint, apiKey, model, temperature, system_prompt, apiSchema, useGoogleSearch, maxOutputTokens, prependSystemPrompt } = currentModel;
    let requestBody;
    let fetchEndpoint = endpoint;
    if (apiSchema === "google") {
      const googleMessages = messages.map((msg) => ({
        role: msg.sender === "User" ? "user" : "model",
        parts: [{ text: msg.content }]
      }));
      if (prependSystemPrompt) {
        const lastMessage = googleMessages[googleMessages.length - 1];
        if (lastMessage.role === "user") {
          lastMessage.parts[0].text = `${system_prompt}

${lastMessage.parts[0].text}`;
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
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE"
          }
        ]
      };
      if (!prependSystemPrompt) {
        requestBody.systemInstruction = {
          role: "user",
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
      fetchEndpoint = endpoint;
    } else {
      let apiMessages;
      if (prependSystemPrompt) {
        apiMessages = messages.map((msg) => ({
          role: msg.sender.toLowerCase(),
          content: msg.content
        }));
        const lastMessage = apiMessages[apiMessages.length - 1];
        if (lastMessage.role === "user") {
          lastMessage.content = `${system_prompt}

${lastMessage.content}`;
        }
      } else {
        apiMessages = [
          { role: "system", content: system_prompt },
          ...messages.map((msg) => ({
            role: msg.sender.toLowerCase(),
            content: msg.content
          }))
        ];
      }
      requestBody = {
        model,
        messages: apiMessages,
        temperature
      };
    }
    try {
      const response = await fetch(fetchEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiSchema === "openai" && { "Authorization": `Bearer ${apiKey}` },
          ...apiSchema === "google" && { "x-goog-api-key": apiKey }
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorData.error?.message || "Unknown error"}`);
      }
      const data = await response.json();
      let message;
      if (apiSchema === "google") {
        message = { content: data.candidates[0].content.parts[0].text };
      } else {
        message = data.choices[0]?.message;
      }
      if (message?.content) {
        const assistantMessage = { sender: "Assistant", content: message.content };
        this.addMessage(assistantMessage);
        return assistantMessage;
      } else if (message?.tool_calls) {
        const toolCall = message.tool_calls[0];
        const functionName = toolCall.function.name;
        const functionArgs = toolCall.function.arguments;
        const content = `The model wants to call the '${functionName}' tool with the following arguments: ${functionArgs}. However, tool execution is not yet implemented.`;
        const toolMessage = { sender: "Assistant", content };
        this.addMessage(toolMessage);
        return toolMessage;
      } else {
        throw new Error("API Error: Invalid response format.");
      }
    } catch (error) {
      console.error("API call failed:", error);
      const errorMessage = { sender: "Error", content: `An error occurred: ${error.message}` };
      this.addMessage(errorMessage);
      return errorMessage;
    }
  }
}
window.chatAPI = new ChatAPI();
document.addEventListener("DOMContentLoaded", () => {
  const cycleModelBtn = document.getElementById("cycle-model-btn");
  const modelNickname = document.getElementById("model-nickname");
  const settingsBtn = document.getElementById("settings-btn");
  const chatContainer = document.getElementById("chat-container");
  const resizeHandle = document.getElementById("resize-handle");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const settingsModal = document.getElementById("settings-modal");
  const llmConfigsContainer = document.getElementById("llm-configs-container");
  const addModelBtn = document.getElementById("add-model-btn");
  const saveSettingsBtn = document.getElementById("save-settings-btn");
  const closeSettingsBtn = document.getElementById("close-settings-btn");
  const clearChatBtn = document.getElementById("clear-chat-btn");
  const importSettingsBtn = document.getElementById("import-settings-btn");
  const exportSettingsBtn = document.getElementById("export-settings-btn");
  const copyChatBtn = document.getElementById("copy-chat-btn");
  const footer = document.querySelector("footer");
  let selectedMessage = null;
  document.addEventListener("click", (e) => {
    const controls = document.querySelector(".message-controls");
    if (!controls) return;
    const clickedMessage = e.target.closest("[data-index]");
    const clickedControls = e.target.closest(".message-controls");
    if (!clickedMessage && !clickedControls) {
      removeMessageControls();
    }
  });
  const renderMessages = () => {
    chatContainer.innerHTML = "";
    let lastMessageElement = null;
    window.chatAPI.getMessages().forEach((msg, index) => {
      const messageElement = createMessageElement(msg, index);
      chatContainer.appendChild(messageElement);
      lastMessageElement = messageElement;
    });
    if (lastMessageElement) {
      lastMessageElement.scrollIntoView({ behavior: "smooth" });
    }
  };
  const createMessageElement = (msg, index) => {
    const div = document.createElement("div");
    let bgColor = "bg-gray-300 dark:bg-gray-700";
    let alignClass = "message-assistant";
    if (msg.sender === "User") {
      bgColor = "bg-blue-500 text-white";
      alignClass = "message-user";
    } else if (msg.sender === "Error") {
      bgColor = "bg-red-500 text-white";
    }
    div.className = `p-3 rounded-lg ${bgColor} w-full ${alignClass}`;
    div.textContent = msg.content;
    div.dataset.index = index;
    if (msg.sender !== "Error") {
      div.addEventListener("click", (e) => {
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
    const controls = document.createElement("div");
    controls.className = "message-controls absolute bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 flex space-x-2";
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.addEventListener("click", () => {
      const newContent = prompt("Edit message:", messageElement.textContent);
      if (newContent) {
        window.chatAPI.updateMessage(messageElement.dataset.index, newContent);
        renderMessages();
      }
      removeMessageControls();
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this message?")) {
        window.chatAPI.removeMessage(messageElement.dataset.index);
        renderMessages();
      }
      removeMessageControls();
    });
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋";
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(messageElement.textContent).then(() => {
        alert("Message copied to clipboard!");
      }, () => {
        alert("Failed to copy message.");
      });
      removeMessageControls();
    });
    const regenerateBtn = document.createElement("button");
    regenerateBtn.textContent = "🔄️";
    regenerateBtn.addEventListener("click", async () => {
      const index = parseInt(messageElement.dataset.index);
      const messages = window.chatAPI.getMessages();
      const clickedMessage = messages[index];
      let newMessages;
      if (clickedMessage.sender === "User") {
        newMessages = messages.slice(0, index + 1);
      } else {
        newMessages = messages.slice(0, index);
      }
      window.chatAPI.messages = newMessages;
      window.chatAPI.saveMessages();
      renderMessages();
      const lastMessage = newMessages[newMessages.length - 1];
      if (lastMessage && lastMessage.sender === "User") {
        removeMessageControls();
        sendBtn.disabled = true;
        const pendingMessage = { sender: "Assistant", content: "..." };
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
    controls.style.visibility = "hidden";
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
    controls.style.visibility = "visible";
  };
  const removeMessageControls = () => {
    const controls = document.querySelector(".message-controls");
    if (controls) {
      controls.remove();
    }
    if (selectedMessage) {
      selectedMessage = null;
    }
  };
  const renderLlmConfigs = () => {
    llmConfigsContainer.innerHTML = "";
    window.chatAPI.getModels().forEach((model, index) => {
      const configDiv = document.createElement("div");
      configDiv.className = "mb-4 p-4 border rounded-lg dark:border-gray-600";
      configDiv.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-lg font-semibold">${model.nickname}</h3>
                    <button type="button" class="remove-model-btn text-xl" data-index="${index}">➖</button>
                </div>
                <input type="text" value="${model.endpoint}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Endpoint URL">
                <div class="model-name-container" style="display: ${model.apiSchema === "google" ? "none" : "block"}">
                    <input type="text" value="${model.model}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Model Name">
                </div>
                <input type="text" value="${model.nickname}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Nickname">
                <input type="password" value="${model.apiKey || ""}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="API Key">
                <input type="number" step="0.1" value="${model.temperature}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Temperature">
                <input type="number" value="${model.maxOutputTokens || ""}" class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="Max Output Tokens">
                <textarea class="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" placeholder="System Prompt">${model.system_prompt}</textarea>
                <select class="w-full p-2 mb-2 border rounded dark:bg-gray-700 dark:border-gray-600 api-schema" placeholder="API Schema">
                    <option value="openai" ${model.apiSchema === "openai" ? "selected" : ""}>OpenAI</option>
                    <option value="google" ${model.apiSchema === "google" ? "selected" : ""}>Google</option>
                </select>
                <div class="google-search-container" style="display: ${model.apiSchema === "google" ? "block" : "none"}">
                    <div class="flex items-center mt-2">
                        <input type="checkbox" id="google-search-checkbox-${index}" class="mr-2" ${model.useGoogleSearch ? "checked" : ""}>
                        <label for="google-search-checkbox-${index}">Enable Google Search</label>
                    </div>
                    <div class="flex items-center mt-2">
                        <input type="checkbox" id="prepend-system-prompt-checkbox-${index}" class="mr-2" ${model.prependSystemPrompt ? "checked" : ""}>
                        <label for="prepend-system-prompt-checkbox-${index}">Prepend System Prompt</label>
                    </div>
                </div>
            `;
      llmConfigsContainer.appendChild(configDiv);
    });
    document.querySelectorAll(".remove-model-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const index = e.target.dataset.index;
        window.chatAPI.removeModel(index);
        renderLlmConfigs();
      });
    });
    document.querySelectorAll(".api-schema").forEach((select) => {
      select.addEventListener("change", (e) => {
        const configDiv = e.target.closest(".mb-4");
        const googleSearchContainer = configDiv.querySelector(".google-search-container");
        const modelNameContainer = configDiv.querySelector(".model-name-container");
        if (e.target.value === "google") {
          googleSearchContainer.style.display = "block";
          modelNameContainer.style.display = "none";
        } else {
          googleSearchContainer.style.display = "none";
          modelNameContainer.style.display = "block";
        }
      });
    });
  };
  cycleModelBtn.addEventListener("click", () => {
    const newModel = window.chatAPI.cycleModel();
    modelNickname.textContent = newModel.nickname;
  });
  settingsBtn.addEventListener("click", () => {
    renderLlmConfigs();
    settingsModal.classList.remove("hidden");
  });
  closeSettingsBtn.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
  });
  addModelBtn.addEventListener("click", () => {
    window.chatAPI.addModel({
      endpoint: "",
      apiKey: "",
      model: "",
      nickname: "New Model",
      temperature: 0.7,
      system_prompt: "You are a helpful assistant.",
      apiSchema: "openai",
      maxOutputTokens: 2048
    });
    renderLlmConfigs();
  });
  saveSettingsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const newModels = Array.from(llmConfigsContainer.children).map((configDiv) => {
      return {
        endpoint: configDiv.querySelector('input[placeholder="Endpoint URL"]').value,
        model: configDiv.querySelector(".api-schema").value === "google" ? "" : configDiv.querySelector('input[placeholder="Model Name"]').value,
        nickname: configDiv.querySelector('input[placeholder="Nickname"]').value,
        apiKey: configDiv.querySelector('input[placeholder="API Key"]').value,
        temperature: parseFloat(configDiv.querySelector('input[placeholder="Temperature"]').value),
        maxOutputTokens: parseInt(configDiv.querySelector('input[placeholder="Max Output Tokens"]').value, 10),
        system_prompt: configDiv.querySelector("textarea").value,
        apiSchema: configDiv.querySelector(".api-schema").value,
        useGoogleSearch: configDiv.querySelector(".api-schema").value === "google" ? configDiv.querySelector('input[type="checkbox"]').checked : false,
        prependSystemPrompt: configDiv.querySelector(".api-schema").value === "google" ? configDiv.querySelector('input[id^="prepend-system-prompt-checkbox-"]').checked : false
      };
    });
    window.chatAPI.saveModels(newModels);
    settingsModal.classList.add("hidden");
    modelNickname.textContent = window.chatAPI.getCurrentModel().nickname;
  });
  sendBtn.addEventListener("click", async () => {
    const content = messageInput.value.trim();
    if (content) {
      messageInput.value = "";
      sendBtn.disabled = true;
      const userMessage = { sender: "User", content };
      window.chatAPI.addMessage(userMessage);
      renderMessages();
      const pendingMessage = { sender: "Assistant", content: "..." };
      const pendingDiv = createMessageElement(pendingMessage, -1);
      chatContainer.appendChild(pendingDiv);
      pendingDiv.scrollIntoView({ behavior: "smooth" });
      const response = await window.chatAPI.sendMessage(window.chatAPI.getMessages());
      chatContainer.removeChild(pendingDiv);
      if (response) {
        renderMessages();
      }
      sendBtn.disabled = false;
      messageInput.focus();
    }
  });
  let resizing = false;
  const startResize = (e) => {
    resizing = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
  };
  const doResize = (e) => {
    if (resizing) {
      const clientY = e.clientY || e.touches && e.touches[0].clientY;
      if (clientY === void 0) return;
      const newHeight = window.innerHeight - clientY;
      const minHeight = 120;
      const maxHeight = 500;
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        footer.style.height = `${newHeight}px`;
      }
    }
  };
  const stopResize = () => {
    resizing = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };
  resizeHandle.addEventListener("mousedown", startResize);
  document.addEventListener("mousemove", doResize);
  document.addEventListener("mouseup", stopResize);
  resizeHandle.addEventListener("touchstart", startResize, { passive: true });
  document.addEventListener("touchmove", doResize);
  document.addEventListener("touchend", stopResize);
  clearChatBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear the chat?")) {
      window.chatAPI.clearMessages();
      renderMessages();
    }
  });
  exportSettingsBtn.addEventListener("click", () => {
    const models = window.chatAPI.getModels();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(models, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "gemini-chat-settings.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  });
  importSettingsBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        try {
          const content = readerEvent.target.result;
          const newModels = JSON.parse(content);
          window.chatAPI.saveModels(newModels);
          renderLlmConfigs();
          modelNickname.textContent = window.chatAPI.getCurrentModel().nickname;
          alert("Settings imported successfully!");
        } catch (error) {
          alert("Error importing settings: " + error.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
  copyChatBtn.addEventListener("click", () => {
    const messages = window.chatAPI.getMessages();
    const chatText = messages.map((msg) => `${msg.sender}: ${msg.content}`).join("\n");
    navigator.clipboard.writeText(chatText).then(() => {
      alert("Chat copied to clipboard!");
    }, () => {
      alert("Failed to copy chat.");
    });
  });
  copyChatBtn.addEventListener("click", () => {
    const messages = window.chatAPI.getMessages();
    const chatText = messages.map((msg) => `${msg.sender}: ${msg.content}`).join("\n");
    navigator.clipboard.writeText(chatText).then(() => {
      alert("Chat copied to clipboard!");
    }, () => {
      alert("Failed to copy chat.");
    });
  });
  const currentModel = window.chatAPI.getCurrentModel();
  if (currentModel) {
    modelNickname.textContent = currentModel.nickname;
  } else {
    modelNickname.textContent = "No Model";
    sendBtn.disabled = true;
  }
  renderMessages();
});
