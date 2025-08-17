
class ChatView {
    constructor(chatContainer) {
        this.chatContainer = chatContainer;
    }

    appendMessage(msg) {
        const isScrolledToBottom = this.chatContainer.scrollHeight - this.chatContainer.clientHeight <= this.chatContainer.scrollTop + 1;

        const messageElement = this.createMessageElement(msg);
        this.chatContainer.appendChild(messageElement);

        if (isScrolledToBottom) {
            messageElement.scrollIntoView({ behavior: 'smooth' });
        }
    }

    renderMessages(messages) {
        this.clear();
        messages.forEach(msg => {
            const messageElement = this.createMessageElement(msg);
            this.chatContainer.appendChild(messageElement);
        });
    }

    removeMessage(id) {
        const messageElement = this.chatContainer.querySelector(`[data-id='${id}']`);
        if (messageElement) {
            messageElement.remove();
        }
    }

    editMessage(msg) {
        const messageElement = this.chatContainer.querySelector(`[data-id='${msg.id}']`);
        if (messageElement) {
            const newMessageElement = this.createMessageElement(msg);
            messageElement.replaceWith(newMessageElement);
        }
    }

    clear() {
        this.chatContainer.innerHTML = '';
    }

    createMessageElement(msg) {
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
        div.dataset.id = msg.id;

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = marked.parse(msg.content, { breaks: true });
        div.appendChild(messageContent);

        if (msg.files && msg.files.length > 0) {
            const filesContainer = document.createElement('div');
            filesContainer.className = 'flex flex-wrap gap-2 mt-2';
            msg.files.forEach(file => {
                const fileElement = document.createElement('div');
                fileElement.className = 'flex items-center bg-gray-200 dark:bg-gray-600 rounded-lg p-2';
                const fileName = document.createElement('span');
                fileName.className = 'mr-2 text-gray-800 dark:text-gray-200';
                fileName.style.wordBreak = 'break-all';
                fileName.textContent = file.name;
                fileElement.appendChild(fileName);

                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = '⬇️';
                downloadBtn.className = 'download-file-btn';
                downloadBtn.addEventListener('click', () => {
                    const a = document.createElement('a');
                    a.href = file.data;
                    a.download = file.name;
                    a.click();
                });
                fileElement.appendChild(downloadBtn);
                filesContainer.appendChild(fileElement);
            });
            div.appendChild(filesContainer);
        }

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
                const event = new CustomEvent('message-selected', { 
                    detail: { 
                        messageElement: div, 
                        x: e.clientX, 
                        y: e.clientY 
                    }
                });
                this.chatContainer.dispatchEvent(event);
            });
        }

        return div;
    }
}

window.ChatView = ChatView;
