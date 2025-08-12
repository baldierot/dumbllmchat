
class ChatView {
    constructor() {
        this.chatContainer = document.getElementById('chat-container');
        this.selectedMessage = null;

        window.eventManager.subscribe('messagesChanged', (messages) => this.renderMessages(messages));
        window.eventManager.subscribe('pendingMessage', (message) => this.renderPendingMessage(message));
        window.eventManager.subscribe('responseReceived', () => this.removePendingMessage());

        document.addEventListener('click', (e) => {
            const controls = document.querySelector('.message-controls');
            if (!controls) return;

            const clickedMessage = e.target.closest('[data-index]');
            const clickedControls = e.target.closest('.message-controls');

            if (!clickedMessage && !clickedControls) {
                this.removeMessageControls();
            }
        });

        marked.setOptions({
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            breaks: true
        });
    }

    renderMessages(messages) {
        this.chatContainer.innerHTML = '';
        let lastMessageElement = null;
        messages.forEach((msg, index) => {
            const messageElement = this.createMessageElement(msg, index);
            this.chatContainer.appendChild(messageElement);
            lastMessageElement = messageElement;
        });
        if (lastMessageElement) {
            lastMessageElement.scrollIntoView({ behavior: 'smooth' });
        }
    }

    renderPendingMessage(message) {
        const pendingDiv = this.createMessageElement(message, -1);
        pendingDiv.id = 'pending-message';
        this.chatContainer.appendChild(pendingDiv);
        pendingDiv.scrollIntoView({ behavior: 'smooth' });
    }

    removePendingMessage() {
        const pendingMessage = document.getElementById('pending-message');
        if (pendingMessage) {
            this.chatContainer.removeChild(pendingMessage);
        }
    }

    createMessageElement(msg, index) {
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
        div.innerHTML = marked.parse(msg.content);
        div.dataset.index = index;

        div.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightBlock(block);
        });

        if (msg.sender !== 'Error') {
            div.addEventListener('click', (e) => {
                if (this.selectedMessage) {
                    this.removeMessageControls();
                }
                this.selectedMessage = div;
                this.showMessageControls(div, e.clientX, e.clientY);
            });
        }

        return div;
    }

    showMessageControls(messageElement, x, y) {
        const controls = document.createElement('div');
        controls.className = 'message-controls absolute bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 flex space-x-2';

        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.addEventListener('click', () => {
            const newContent = prompt('Edit message:', window.chatStore.getMessages()[messageElement.dataset.index].content);
            if (newContent) {
                window.chatStore.updateMessage(messageElement.dataset.index, newContent);
            }
            this.removeMessageControls();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this message?')) {
                window.chatStore.removeMessage(messageElement.dataset.index);
            }
            this.removeMessageControls();
        });

        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋';
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(messageElement.textContent).then(() => {
                alert('Message copied to clipboard!');
            }, () => {
                alert('Failed to copy message.');
            });
            this.removeMessageControls();
        });

        const regenerateBtn = document.createElement('button');
        regenerateBtn.textContent = '🔄️';
        regenerateBtn.addEventListener('click', async () => {
            const index = parseInt(messageElement.dataset.index);
            const messages = window.chatStore.getMessages();
            const clickedMessage = messages[index];

            let newMessages;
            if (clickedMessage.sender === 'User') {
                newMessages = messages.slice(0, index + 1);
            } else { // Assistant message
                newMessages = messages.slice(0, index);
            }

            window.chatStore.messages = newMessages;
            window.chatStore._saveMessages();

            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.sender === 'User') {
                this.removeMessageControls();

                const pendingMessage = { sender: 'Assistant', content: '...' };
                window.eventManager.publish('pendingMessage', pendingMessage);

                const response = await window.chatStore.sendMessage(newMessages);
                window.eventManager.publish('responseReceived', response);
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
    }

    removeMessageControls() {
        const controls = document.querySelector('.message-controls');
        if (controls) {
            controls.remove();
        }
        if (this.selectedMessage) {
            this.selectedMessage = null;
        }
    }

    init() {
        this.renderMessages(window.chatStore.getMessages());
    }
}
