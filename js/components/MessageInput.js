
class MessageInput {
    constructor() {
        this.messageInput = document.getElementById('message-input');
        this.sendBtn = document.getElementById('send-btn');
        this.resizeHandle = document.getElementById('resize-handle');
        this.footer = document.querySelector('footer');

        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.initResize();
    }

    async sendMessage() {
        const content = this.messageInput.value.trim();
        if (content) {
            this.messageInput.value = '';
            this.sendBtn.disabled = true;

            const userMessage = { sender: 'User', content };
            window.chatStore.addMessage(userMessage);

            const pendingMessage = { sender: 'Assistant', content: '...' };
            window.eventManager.publish('pendingMessage', pendingMessage);

            const response = await window.chatStore.sendMessage(window.chatStore.getMessages());

            window.eventManager.publish('responseReceived', response);

            this.sendBtn.disabled = false;
            this.messageInput.focus();
        }
    }

    initResize() {
        let resizing = false;
        const startResize = (e) => {
            resizing = true;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'row-resize';
        };

        const doResize = (e) => {
            if (resizing) {
                const clientY = e.clientY || (e.touches && e.touches[0].clientY);
                if (clientY === undefined) return;
                const newHeight = window.innerHeight - clientY;
                const minHeight = 120; // Minimum height for the footer
                const maxHeight = 500; // Maximum height for the footer
                if (newHeight >= minHeight && newHeight <= maxHeight) {
                    this.footer.style.height = `${newHeight}px`;
                }
            }
        };

        const stopResize = () => {
            resizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        this.resizeHandle.addEventListener('mousedown', startResize);
        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);

        this.resizeHandle.addEventListener('touchstart', startResize, { passive: true });
        document.addEventListener('touchmove', doResize);
        document.addEventListener('touchend', stopResize);
    }
}
